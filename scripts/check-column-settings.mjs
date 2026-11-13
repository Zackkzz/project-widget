import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Verify the actual upload bundle in the parent test's isolated mocked-SDK browser. */
export async function checkColumnSettings(page, widget) {
  const originalViewport = page.viewportSize();
  await widget.getByRole('button', { name: 'Choose fields', exact: true }).click();
  const dialog = widget.getByRole('dialog', { name: 'Choose and arrange columns' });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.field-order-available').count(), 0);
  assert.equal(
    await dialog.getByRole('checkbox', { name: 'Show Project Name', exact: true }).isDisabled(),
    true,
  );
  const before = await dialog
    .locator('.column-setting-row')
    .evaluateAll((rows) => rows.map((row) => row.dataset.column));
  const moveDown = dialog.getByRole('button', { name: /^Move .* down$/ }).first();
  const movable = moveDown.locator('xpath=ancestor::div[contains(@class,"column-setting-row")]');
  const label = await movable.getAttribute('data-column');
  await moveDown.click();
  const after = await dialog
    .locator('.column-setting-row')
    .evaluateAll((rows) => rows.map((row) => row.dataset.column));
  assert.notEqual(before.indexOf(label), after.indexOf(label));
  const dragRow = dialog.locator('.column-setting-row').nth(1);
  const dragName = await dragRow.getAttribute('data-column');
  const handle = dragRow.getByRole('button', { name: /^Drag / });
  await handle.dragTo(dialog.locator('.column-setting-row').nth(3));
  await dialog.locator('.column-setting-row.is-previewing').first().waitFor({ state: 'hidden' });
  const draggedOrder = await dialog
    .locator('.column-setting-row')
    .evaluateAll((rows) => rows.map((row) => row.dataset.column));
  assert.equal(draggedOrder.indexOf(dragName), 3);
  const activeHandle = dialog
    .locator('.column-setting-row')
    .nth(1)
    .getByRole('button', { name: /^Drag / });
  const transfer = await activeHandle.evaluateHandle(() => new DataTransfer());
  await activeHandle.dispatchEvent('dragstart', { dataTransfer: transfer });
  const scrollList = dialog.locator('.column-settings-list');
  const previewBounds = await scrollList.boundingBox();
  await scrollList.dispatchEvent('dragover', {
    dataTransfer: transfer,
    clientX: previewBounds.x + 80,
    clientY: previewBounds.y + 4 * 48 + 24,
  });
  const previewRow = dialog.locator('.column-setting-row').nth(1);
  assert.equal(await previewRow.getAttribute('data-position'), '5');
  assert.equal(await previewRow.locator('.column-position').textContent(), '5');
  // Child dragleave and tiny movements across a row boundary must not reset/reverse the preview.
  await activeHandle.dispatchEvent('dragleave', { dataTransfer: transfer, relatedTarget: null });
  assert.equal(await previewRow.getAttribute('data-position'), '5');
  for (const delta of [-2, 2, -1, 1]) {
    await scrollList.dispatchEvent('dragover', {
      dataTransfer: transfer,
      clientX: previewBounds.x + 80,
      clientY: previewBounds.y + 4 * 48 + delta,
    });
    assert.equal(await previewRow.getAttribute('data-position'), '5');
  }
  const previewOrder = await dialog
    .locator('.column-setting-row')
    .evaluateAll((rows) => rows.map((row) => row.dataset.column));
  assert.deepEqual(previewOrder, draggedOrder, 'Drag preview must not commit the draft order.');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    await dialog.screenshot({ path: join(tmpdir(), `widget-columns-preview-${width}.png`) });
  }
  await page.setViewportSize(originalViewport);
  await activeHandle.dispatchEvent('dragend');
  await dialog.locator('.column-setting-row.is-previewing').first().waitFor({ state: 'hidden' });
  assert.equal(await previewRow.getAttribute('data-position'), '2');
  await activeHandle.dispatchEvent('dragstart', { dataTransfer: transfer });
  const listBounds = await scrollList.boundingBox();
  await scrollList.dispatchEvent('dragover', {
    dataTransfer: transfer,
    clientX: listBounds.x + 30,
    clientY: listBounds.y + listBounds.height - 5,
  });
  await page.waitForFunction(
    () =>
      document.querySelector('iframe').contentDocument.querySelector('.column-settings-list')
        .scrollTop > 0,
  );
  await activeHandle.dispatchEvent('dragend');
  await dialog.locator('.column-setting-row.is-previewing').first().waitFor({ state: 'hidden' });
  await scrollList.evaluate((node) => {
    node.scrollTop = 0;
  });
  // Search does not change pending selection or rank.
  const search = dialog.getByRole('searchbox', { name: 'Search fields' });
  await search.fill('no-such-field');
  await dialog.getByText('No fields found.', { exact: true }).waitFor();
  await search.fill('');
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 1);
  await dialog.getByRole('button', { name: 'Reset to default', exact: true }).click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.width <= width && bounds.x >= 0 && bounds.y >= 0);
    assert.equal(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    await dialog.screenshot({ path: join(tmpdir(), `widget-columns-${width}.png`) });
  }
  await page.setViewportSize(originalViewport);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await widget.getByRole('button', { name: 'Choose fields', exact: true }).click();
  const restored = await dialog
    .locator('.column-setting-row')
    .evaluateAll((rows) => rows.map((row) => row.dataset.column));
  assert.deepEqual(restored, before);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await widget.getByRole('button', { name: 'Choose fields', exact: true }).click();
  const motion = await dialog.evaluate(async (node) => {
    const list = node.querySelector('.column-settings-list');
    const rows = Array.from(list.querySelectorAll('.column-setting-row'));
    const source = rows[1];
    const handle = source.querySelector('[draggable="true"]');
    const transfer = new DataTransfer();
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    await nextFrame();
    const bounds = list.getBoundingClientRect();
    list.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: bounds.left + 80,
        clientY: bounds.top + 3 * 48 + 24,
      }),
    );
    await nextFrame();
    // Release while rows are still sliding, and inspect every rendered frame across the DOM reorder.
    list.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    const tops = [];
    for (let frame = 0; frame < 24; frame++) {
      tops.push(source.getBoundingClientRect().top);
      await nextFrame();
    }
    return {
      largestStep: Math.max(...tops.slice(1).map((top, index) => Math.abs(top - tops[index]))),
      position: source.getAttribute('data-position'),
      previewing: source.classList.contains('is-previewing'),
    };
  });
  assert.equal(motion.position, '4');
  assert.equal(motion.previewing, false);
  assert.ok(motion.largestStep < 48, `Drop jumped ${motion.largestStep}px between frames.`);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  console.log(
    'Verified combined column selection, ordering, search, reset, cancel/apply, and desktop/mobile bounds.',
  );
}

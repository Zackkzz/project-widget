import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { checkColumnSettings } from './check-column-settings.mjs';

// Exercises the shipped editor and real browser IndexedDB, without contacting Zoho.
const scratch = await mkdtemp(join(tmpdir(), 'widget-cache-test-'));
let browser;
try {
  execFileSync('unzip', ['-q', resolve('artifacts/project-widget.zip'), '-d', scratch]);
  await build({
    stdin: {
      contents:
        'export * from "./app/src/cache/projectCache";export * from "./app/src/cache/snapshotStore";export * from "./app/src/cache/editorDraftStore";',
      resolveDir: process.cwd(),
    },
    outfile: join(scratch, 'test-cache.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
  });
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.route('https://widget.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<iframe style="width:100%;height:95vh" src="/app/widget.html"></iframe>',
      });
    const contentType = path.endsWith('.svg')
      ? 'image/svg+xml'
      : path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : 'text/html';
    await route.fulfill({ contentType, body: await readFile(join(scratch, path)) });
  });
  await page.addInitScript(() => {
    const project = {
      ID: '101',
      Project_Name: 'Cache project',
      Project_ID: 'CACHE-1',
      Client: { ID: '301', zc_display_value: 'Solmech', Business_Name: 'Solmech' },
      PO: Array.from({ length: 4 }, (_, index) => ({ ID: String(800 + index) })),
      Service_Tickets: Array.from({ length: 4 }, (_, index) => ({ ID: String(900 + index) })),
      Issue_Register: Array.from({ length: 4 }, (_, index) => ({ ID: String(1000 + index) })),
    };
    const bom = {
      ID: '601',
      Original_Product_Model: { ID: '701', zc_display_value: 'Model A' },
      Original_SN: 'SN-601',
      Original_Quantity: '1',
      Replacement_Product_Model: '',
      Replacement_SN: '',
      Replacement_Quantity: '',
      Warranty_Type: '',
      Warranty_Start_Date: '',
      Warranty_End_Date: '',
      History: 'preserve this history',
      Notes: '',
    };
    window.cacheRequests = [];
    window.changeBomOnServer = () => (bom.Notes = 'Changed by another user');
    window.changeQuantityOnServer = () => (bom.Original_Quantity = '5');
    window.activeReads = 0;
    window.maxReads = 0;
    window.denyProject = false;
    window.blockReads = () => {
      window.readGate = new Promise((resolveGate) => (window.releaseReads = resolveGate));
    };
    window.blockReads();
    window.ZOHO = {
      CREATOR: {
        UTIL: {
          getInitParams: async () => ({ appLinkName: 'sungrowauservice', loginUser: 'tester' }),
        },
        META: { getFields: async () => ({ code: 3000, fields: [] }) },
        DATA: {
          addRecords: async () => ({ code: 3000, data: { ID: '501' } }),
          getRecords: async (config) => {
            window.cacheRequests.push(config);
            if (config.report_name === 'Project_Report')
              return { code: 3000, data: [structuredClone(project)] };
            if (config.report_name === 'BOM_Record') {
              await window.readGate;
              return { code: 3000, data: [structuredClone(bom)] };
            }
            return { code: 3000, data: [] };
          },
          getRecordById: async (config) => {
            window.cacheRequests.push(config);
            if (config.report_name === 'Client_System')
              return {
                code: 3000,
                data: {
                  ID: '301',
                  Note: '',
                  Country: {},
                  State: '',
                  Phone_Number: '',
                  Email: '',
                  Office_Address: '',
                  Inverter_Capacity: '509.64',
                  BESS_Capacity: '1288.25',
                  PCS_Capacity: '276.53',
                  C4: [],
                  Project: [],
                  ABN: '',
                  Business_Name: 'Solmech',
                },
              };
            window.activeReads++;
            window.maxReads = Math.max(window.maxReads, window.activeReads);
            try {
              await window.readGate;
              await new Promise((resolveRead) => setTimeout(resolveRead, 10));
              if (window.denyProject && config.report_name === 'Project_Report')
                return { code: 3100, message: 'Permission denied to view records.' };
              return {
                code: 3000,
                data:
                  config.report_name === 'Project_Report'
                    ? structuredClone(project)
                    : config.report_name === 'BOM_Record'
                      ? { ...structuredClone(bom), Single_Record_Metadata: 'extra server field' }
                      : { ID: config.id },
              };
            } finally {
              window.activeReads--;
            }
          },
          updateRecordById: async (config) => {
            window.lastUpdate = config;
            Object.assign(config.report_name === 'BOM_Record' ? bom : project, config.payload.data);
            return { code: 3000, data: { ID: config.id } };
          },
        },
      },
    };
  });
  await page.goto('https://widget.test/');
  const widget = page.frameLocator('iframe');
  const edit = widget.getByRole('button', { name: 'Edit Cache project', exact: true });
  await edit.waitFor();
  await widget.getByRole('button', { name: 'Solmech', exact: true }).click();
  const clientDialog = widget
    .getByRole('dialog')
    .filter({ has: widget.getByRole('heading', { name: 'Client', exact: true }) });
  await clientDialog.getByRole('button', { name: 'Cache project', exact: true }).waitFor();
  const clientFields = await clientDialog.locator('th[scope="row"]').allTextContents();
  assert.deepEqual(clientFields.slice(0, 8), [
    'Business Name',
    'ABN',
    'Projects',
    'C4',
    'PCS Capacity (MW)',
    'BESS Capacity (MWh)',
    'Inverter Capacity (MW)',
    'Office Address',
  ]);
  assert.ok(clientFields.indexOf('State') < clientFields.indexOf('Country'));
  await clientDialog.screenshot({ path: join(tmpdir(), 'widget-client-field-order.png') });
  await clientDialog.getByRole('button', { name: 'Close related record' }).click();
  await checkColumnSettings(page, widget);
  // Enter applies valid criteria without focusing the toolbar; validation and Escape retain their focus behavior.
  const filters = widget.getByRole('button', { name: 'Filters', exact: true });
  await filters.click();
  const filterPanel = widget.locator('#project-filter-panel');
  const filterInput = filterPanel.getByRole('textbox', { name: 'Value 1', exact: true });
  await filterInput.press('Enter');
  await filterPanel
    .getByText('Enter a valid value for each condition, or remove the unused row.', { exact: true })
    .waitFor();
  assert(await filterInput.evaluate((input) => document.activeElement === input));
  await filterInput.fill('Cache');
  await filterInput.press('Enter');
  await filterPanel.waitFor({ state: 'detached' });
  assert(
    !(await widget
      .getByRole('button', { name: 'Filters (1)', exact: true })
      .evaluate((button) => document.activeElement === button)),
  );
  await widget.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await filters.click();
  const reopenedValue = filterPanel.getByRole('textbox', { name: 'Value 1', exact: true });
  await reopenedValue.press('Escape');
  await filterPanel.waitFor({ state: 'detached' });
  assert(await filters.evaluate((button) => document.activeElement === button));
  console.log(
    'Verified Enter applies filters without a toolbar focus jump; validation and Escape keep expected focus.',
  );
  const started = performance.now();
  await edit.click();
  await widget
    .getByRole('button', { name: 'Close editor', exact: true })
    .waitFor({ timeout: 1500 });
  const shellMs = Math.round(performance.now() - started);
  assert(await widget.getByLabel('Project Name', { exact: true }).isDisabled());
  assert(
    await widget
      .locator('form')
      .getByRole('button', { name: 'Review changes', exact: true })
      .isDisabled(),
  );
  assert.equal(await widget.locator('.record-editor').getAttribute('aria-busy'), 'true');
  await page.frames()[1].evaluate(() => window.releaseReads());
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  assert(await widget.getByLabel('Project Name', { exact: true }).isEnabled());
  const counts = await page.frames()[1].evaluate(() => ({
    maxReads: window.maxReads,
    bomReads: window.cacheRequests.filter((item) => item.report_name === 'BOM_Record' && item.id)
      .length,
  }));
  assert(counts.maxReads <= 4);
  assert.equal(counts.bomReads, 0, 'Complete BOM report rows should not be fetched again by ID.');
  console.log(`Editor shell: ${shellMs} ms with requests deliberately blocked; saves disabled.`);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await widget
      .locator('.record-heading')
      .first()
      .screenshot({
        path: join(scratch, `editor-${width}.png`),
      });
  }
  await widget.getByLabel('Project Name', { exact: true }).fill('Updated cache project');
  await widget.locator('form').getByRole('button', { name: 'Review changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).waitFor();
  const payload = await page.frames()[1].evaluate(() => window.lastUpdate.payload.data);
  assert.equal(payload.Project_Name, 'Updated cache project');
  assert(!Object.hasOwn(payload, 'History'));
  assert(!Object.hasOwn(payload, 'BOM'));

  // Report-list BOM baselines still support safe edits when the single-record API adds metadata.
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  await widget
    .locator('.edit-bom')
    .getByRole('radio', { name: 'Detail View', exact: true })
    .check();
  await widget.locator('.edit-bom').locator('input[id="BOM.0.Original_Quantity"]').fill('2');
  await widget.locator('form').getByRole('button', { name: 'Review changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).waitFor();
  const bomUpdate = await page.frames()[1].evaluate(() => window.lastUpdate);
  assert.equal(bomUpdate.report_name, 'BOM_Record');
  assert.equal(bomUpdate.payload.data.Original_Quantity, 2);
  assert(!Object.hasOwn(bomUpdate.payload.data, 'History'));

  // A genuine server change must continue to reject a stale draft.
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  await widget
    .locator('.edit-bom')
    .getByRole('radio', { name: 'Detail View', exact: true })
    .check();
  await widget.locator('.edit-bom').locator('input[id="BOM.0.Original_Quantity"]').fill('3');
  await page.frames()[1].evaluate(() => window.changeBomOnServer());
  await widget.locator('form').getByRole('button', { name: 'Review changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget
    .getByText(
      'This project changed while you were editing. Review the latest changes before saving.',
      { exact: true },
    )
    .waitFor();
  await widget.getByRole('button', { name: 'Review latest changes', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  assert.equal(await widget.locator('input[id="BOM.0.Original_Quantity"]').inputValue(), '3');
  await widget.locator('form').getByRole('button', { name: 'Review changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).waitFor();

  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  await widget
    .locator('.edit-bom')
    .getByRole('radio', { name: 'Detail View', exact: true })
    .check();
  await widget.locator('input[id="BOM.0.Original_Quantity"]').fill('4');
  await page.frames()[1].evaluate(() => window.changeQuantityOnServer());
  await widget.locator('form').getByRole('button', { name: 'Review changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Review latest changes', exact: true }).click();
  await widget.getByRole('dialog').waitFor();
  assert(
    await widget.getByRole('button', { name: 'Review merged changes', exact: true }).isDisabled(),
  );
  assert(
    await page
      .frames()[1]
      .evaluate(() =>
        document.querySelector('.draft-conflict-dialog').contains(document.activeElement),
      ),
  );

  await widget.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert(await widget.getByLabel('Project Name', { exact: true }).isEnabled());
  await widget.getByRole('button', { name: 'Review latest changes', exact: true }).click();
  await widget.getByRole('radio', { name: /Keep my change for/ }).waitFor();
  assert(
    await widget
      .locator('form')
      .getByRole('button', { name: 'Review changes', exact: true })
      .isDisabled(),
  );
  for (const width of process.env.CAPTURE_RECOVERY_UI ? [1280, 390] : []) {
    await page.setViewportSize({ width, height: 900 });
    await widget
      .locator('.draft-conflict-dialog')
      .screenshot({ path: join(tmpdir(), `widget-conflict-${width}.png`) });
  }
  const assetGeometry = await widget.locator('.draft-conflict-dialog img').evaluateAll((images) =>
    images.map((image) => ({
      loaded: image.complete && image.naturalWidth > 0,
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    })),
  );
  assert(assetGeometry.every((image) => image.loaded && image.width === 18 && image.height === 18));
  await widget.getByRole('radio', { name: /Keep my change for/ }).check();
  await widget.getByRole('button', { name: 'Review merged changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Save changes', exact: true }).click();
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).waitFor();

  // A browser refresh must restore the draft after fresh server verification.
  await widget.getByRole('button', { name: 'Edit Updated cache project', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  await widget.getByLabel('Project Name', { exact: true }).fill('Recovered draft');
  await page
    .frames()[1]
    .waitForFunction(() =>
      Object.keys(sessionStorage).some(
        (key) =>
          key.startsWith('project-widget-draft:') &&
          sessionStorage.getItem(key)?.includes('Recovered draft'),
      ),
    );
  await page.reload();
  await widget.getByRole('button', { name: 'Restore draft', exact: true }).waitFor();
  await page.frames()[1].evaluate(() => window.releaseReads());
  await widget.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  assert.equal(
    await widget.getByLabel('Project Name', { exact: true }).inputValue(),
    'Recovered draft',
  );
  await widget.getByRole('button', { name: 'Close editor', exact: true }).click();
  await widget.getByRole('button', { name: 'Discard changes', exact: true }).click();
  console.log(
    'Verified conflict recovery, explicit overlapping-field choices, and browser-refresh draft restoration.',
  );

  await widget.getByRole('button', { name: 'Edit Cache project', exact: true }).waitFor();
  // Closing a pending editor must invalidate its UI completion token.
  await page.frames()[1].evaluate(() => window.blockReads());
  await widget.getByRole('button', { name: 'Edit Cache project', exact: true }).click();
  await widget.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.frames()[1].evaluate(() => window.releaseReads());
  await widget.getByRole('button', { name: 'Edit Cache project', exact: true }).waitFor();
  assert.equal(await widget.locator('.record-editor').count(), 0);

  await page.frames()[1].evaluate(() => {
    window.denyProject = true;
  });
  await widget.getByRole('button', { name: 'Edit Cache project', exact: true }).click();
  await widget.getByRole('button', { name: 'Retry loading', exact: true }).waitFor();
  assert(
    await widget
      .locator('form')
      .getByRole('button', { name: 'Review changes', exact: true })
      .isDisabled(),
  );
  assert.equal(await widget.getByLabel('Project Name', { exact: true }).count(), 1);
  assert.equal(
    await widget.getByLabel('Project Name', { exact: true }).inputValue(),
    'Cache project',
  );
  await page.frames()[1].evaluate(() => (window.denyProject = false));
  await widget.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await widget.locator('.record-editor[aria-busy="false"]').waitFor();
  assert(await widget.getByLabel('Project Name', { exact: true }).isEnabled());
  console.log('Verified save payloads, closing during loading, failed permissions, and retry.');

  // Verify real IndexedDB across independent store instances, plus bounded persistent eviction.
  const storage = await page.evaluate(async () => {
    const { SnapshotStore, createProjectCacheRuntime, EditorDraftStore } =
      await import('/test-cache.js');
    const store = new SnapshotStore('browser-test-a', true, { diskBytes: 1200 });
    for (let index = 0; index < 7; index++)
      store.put(String(index), {
        record: { id: String(index), raw: { Notes: 'x'.repeat(200) } },
        projectFetchedAt: Date.now(),
      });
    await store.settled();
    const reopened = new SnapshotStore('browser-test-a', true);
    const otherUser = new SnapshotStore('browser-test-b', true);
    const persisted = (await reopened.read('6'))?.record?.id;
    const isolated = !(await otherUser.read('6'));
    const oldestEvicted = !(await reopened.read('0'));
    store.clear();
    await store.settled();

    // Gateway-level paging, request sharing, forced editor verification and failed-save invalidation.
    const drafts = new EditorDraftStore('browser-draft-test');
    const originalDraft = { values: { Notes: 'Old' }, sections: {} };
    const selectedFile = new File(['selected file content'], 'issue.txt', { type: 'text/plain' });
    const changedDraft = {
      values: { Notes: 'Mine' },
      sections: {
        Issue_Register: [
          { key: 'issue', id: 'issue', original: {}, values: {}, files: [selectedFile] },
        ],
      },
    };
    await drafts.save({ id: 'draft-one', isBom: false, base: originalDraft, draft: changedDraft });
    const restoredDraft = await new EditorDraftStore('browser-draft-test').load('draft-one');
    const filesRestored =
      restoredDraft?.draft.sections.Issue_Register[0].files[0] instanceof File &&
      (await restoredDraft.draft.sections.Issue_Register[0].files[0].text()) ===
        'selected file content';
    const userDraftIsolated = !(await new EditorDraftStore('different-user').load('draft-one'));
    const pendingSave = drafts.save({
      id: 'draft-one',
      isBom: false,
      base: originalDraft,
      draft: changedDraft,
    });
    const pendingClear = drafts.clear('draft-one');
    await Promise.all([pendingSave, pendingClear]);
    const clearedDraft = !(await new EditorDraftStore('browser-draft-test').load('draft-one'));
    await drafts.save({ id: 'tab-test', isBom: false, base: originalDraft, draft: changedDraft });
    const tabKey = 'project-widget-draft-tab:browser-draft-test';
    const originalTab = sessionStorage.getItem(tabKey);
    sessionStorage.setItem(tabKey, crypto.randomUUID());
    const tabDraftIsolated = !(await new EditorDraftStore('browser-draft-test').load('tab-test'));
    sessionStorage.setItem(tabKey, originalTab);
    await drafts.clear('tab-test');

    const runtime = createProjectCacheRuntime(
      { DATA: {} },
      { user: 'runtime-tester', app: 'test' },
      ['Notes'],
    );
    let reads = 0;
    let pages = 0;
    let expanded = 0;
    let version = 1;
    let gate = Promise.resolve();
    const gateway = {
      list: async () => ({ records: [] }),
      get: async (id) => {
        reads++;
        await gate;
        return { id, raw: { Project_Name: `Version ${version}` } };
      },
      bom: async (_id, cursor) => {
        pages++;
        return cursor
          ? { records: [{ id: '2', raw: { Notes: 'two' } }] }
          : { records: [{ id: '1', raw: { Notes: 'one' } }], cursor: 'second' };
      },
      getBom: async () => {
        expanded++;
        throw new Error('Complete rows must be reused');
      },
      update: async () => {
        throw new Error('Unconfirmed save');
      },
    };
    const cached = runtime.attach(gateway, gateway);
    await Promise.all([cached.prepareEditor('101'), cached.prepareEditor('101')]);
    const deduplicated = reads === 1 && pages === 2 && expanded === 0;
    const allPages = cached.peekEditor('101').bom.length === 2;
    version = 2;
    await cached.prepareEditor('101');
    const refreshed =
      reads === 2 && cached.peekEditor('101').record.raw.Project_Name === 'Version 2';
    try {
      await cached.update();
    } catch {
      // Failed or ambiguous writes must still invalidate the old snapshot.
    }
    const invalidated = !cached.peekEditor('101');
    let release;
    gate = new Promise((resolveGate) => (release = resolveGate));
    const staleLoad = cached.prepareEditor('101').then(
      () => false,
      () => true,
    );
    try {
      await cached.update();
    } catch {}
    release();
    const staleRejected = await staleLoad;
    cached.disposeCache();

    const prefetchedIds = [];
    const prefetchRuntime = createProjectCacheRuntime(
      { DATA: {} },
      { user: 'prefetch-tester', app: 'test' },
      ['Notes'],
    );
    const prefetchGateway = {
      ...gateway,
      list: async () => ({
        records: Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), raw: {} })),
      }),
      get: async (id) => {
        prefetchedIds.push(id);
        return { id, raw: { Project_Name: id } };
      },
    };
    const prefetched = prefetchRuntime.attach(prefetchGateway, prefetchGateway);
    await prefetched.list({});
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const boundedPrefetch = prefetchedIds.join(',') === '1,2';
    prefetched.disposeCache();
    return {
      filesRestored,
      userDraftIsolated,
      clearedDraft,
      tabDraftIsolated,
      persisted,
      isolated,
      oldestEvicted,
      deduplicated,
      allPages,
      refreshed,
      invalidated,
      staleRejected,
      boundedPrefetch,
    };
  });
  assert.equal(storage.persisted, '6');
  for (const [name, passed] of Object.entries(storage).filter(([name]) => name !== 'persisted'))
    assert.equal(passed, true, name);
  assert.deepEqual(errors, []);
  console.log(
    'Verified IndexedDB persistence/eviction/user isolation, complete pagination, deduplication, fresh baselines, and invalidation.',
  );
} finally {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
}

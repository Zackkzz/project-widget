import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const scratch = await mkdtemp(join(tmpdir(), 'issue-disclosure-'));
let browser;
try {
  execFileSync('unzip', ['-q', resolve('artifacts/project-widget.zip'), '-d', scratch]);
  const scriptPath = '/app/assets/widget-client-project-links.js';
  let bundle = await readFile(join(scratch, scriptPath), 'utf8');
  const mount =
    'E0.createRoot(document.getElementById("root")).render(r.jsx(Lg.StrictMode,{children:r.jsx(Wj,{children:r.jsx(Jj,{})})}));';
  assert.equal(bundle.split(mount).length, 2);
  const text =
    'During sea freight to Australia, insufficient protective packaging led to impact damage, causing the vent panel to deform. ' +
    'Additional investigation and corrective actions are recorded for the affected shipment. '.repeat(
      5,
    );
  bundle = bundle.replace(
    mount,
    `E0.createRoot(document.getElementById("root")).render(r.jsx(is,{fields:[{name:"Issue_ID",label:"Issue ID"},{name:"Issue_Description",label:"Issue Description"},...Array.from({length:15},(_,i)=>({name:"Field"+i,label:"Field "+i}))],rows:[{ID:"1",Issue_ID:"ISSUE-1",Issue_Description:${JSON.stringify(text)}},{ID:"2",Issue_ID:"ISSUE-2",Issue_Description:"Short description"},{ID:"3",Issue_ID:"ISSUE-3",Issue_Description:""}],label:"Issue Register",className:"issue-detail-table"}));`,
  );
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://widget.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === scriptPath) return route.fulfill({ contentType: 'text/javascript', body: bundle });
    let body = await readFile(join(scratch, path));
    if (path.endsWith('.html'))
      body = Buffer.from(
        body
          .toString()
          .replace(
            '</head>',
            '<style>body{padding:24px}.issue-detail-table th:last-child,.issue-detail-table td:last-child{width:240px}.issue-detail-table{table-layout:fixed}</style></head>',
          ),
      );
    return route.fulfill({
      contentType: path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.js')
          ? 'text/javascript'
          : 'text/html',
      body,
    });
  });
  await page.goto('https://widget.test/app/widget.html');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const row = page.getByRole('row').filter({ hasText: 'ISSUE-1' });
    const button = row.getByRole('button', { name: 'Show more', exact: true });
    await button.waitFor({ timeout: 3000 });
    const preview = row.locator('.subform-text-preview');
    const size = await preview.evaluate((el) => ({
      height: el.clientHeight,
      scroll: el.scrollHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    assert(size.scroll > size.height);
    assert(size.height <= size.line * 3 + 2);
    assert.equal(
      await page.getByRole('row').filter({ hasText: 'ISSUE-2' }).getByRole('button').count(),
      0,
    );
    assert.equal(
      await page.getByRole('row').filter({ hasText: 'ISSUE-3' }).getByRole('button').count(),
      0,
    );
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    await button.focus();
    await button.press('Enter');
    assert.equal(
      await row.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded'),
      'true',
    );
    assert((await preview.innerText()).includes('corrective actions'));
    await row.getByRole('button', { name: 'Show less' }).click();
    await button.waitFor();
    await page.screenshot({ path: join(tmpdir(), `issue-description-folded-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Verified three-line Issue Description preview, full expansion, keyboard toggle, short/empty values, and desktop/mobile rendering.',
  );
} finally {
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
}

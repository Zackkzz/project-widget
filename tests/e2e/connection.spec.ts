import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Model Creator sending its registration message once, when the iframe loads.
const sdk = `
  let ready;
  const initialized = new Promise(resolve => { ready = resolve; });
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.data.type === '__REGISTER__') {
      ready({ appLinkName: 'sungrowauservice' });
    }
  });
  window.ZOHO = { CREATOR: {
    UTIL: { getInitParams: () => initialized },
    DATA: { getRecords: async () => ({ code: 3100 }) }
  } };
`;

test('SDK is listening before the embedded widget finishes loading', async ({ page }) => {
  if (process.env.TEST_WIDGET_BUILD) {
    await page.route('**/widget.html', (route) =>
      route.fulfill({ path: 'dist/app/widget.html', contentType: 'text/html' }),
    );
    await page.route('**/assets/*', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      await route.fulfill({
        body: await readFile(`dist/app/assets/${name}`),
        contentType: name.endsWith('.js') ? 'application/javascript' : 'text/css',
      });
    });``
  }
  await page.route('https://static.zohocdn.com/**/widgetsdk-min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ contentType: 'application/javascript', body: sdk });
  });
  await page.route('**/connection-host', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<iframe src="/widget.html" onload="this.contentWindow.postMessage({type:'__REGISTER__'}, location.origin)"></iframe>`,
    }),
  );
  await page.goto('/connection-host');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Create a project', exact: true }),
  ).toBeVisible();
});

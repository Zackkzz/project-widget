import { test, expect, type Page } from '@playwright/test';
async function details(page: Page, type = 'C&I - Channel') {
  await page.getByLabel('Project name').fill('Riverbank Energy Hub');
  await page.getByLabel('Project type', { exact: false }).selectOption(type);
  await page.getByLabel('Grid-GFL', { exact: true }).check();
  await page.getByLabel('Coupling type').selectOption('AC Coupling');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(option);
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function location(page: Page) {
  await pick(page, 'Client', 'Riverbank Energy (sample)');
  await pick(page, 'Site', 'Riverbank site (sample)');
  await pick(page, 'Country', 'Australia');
  await page.getByLabel('State', { exact: false }).selectOption('NSW');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
test('guided preview validates, persists values, reviews and never submits', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/widget.html');
  await expect(page.getByRole('heading', { name: 'Create a project' })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-step1.png`, fullPage: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('3 fields need attention')).toBeVisible();
  await page.getByRole('button', { name: 'Scenario', exact: true }).click();
  await expect(page.getByLabel('Grid-GFM', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Project type', exact: true }).click();
  await expect(page.getByLabel('Project type')).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-validation.png`,
    fullPage: true,
  });
  await details(page);
  await location(page);
  await expect(page.getByText('Milestones are added after creation')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Client', exact: true })).toHaveValue(
    'Riverbank Energy (sample)',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('PCS capacity (MW)').fill('2.5');
  await page.getByLabel('BESS capacity (MWh)').fill('5');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByText('Riverbank Energy Hub')).toBeVisible();
  await expect(page.getByText('2.5 MW', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-review.png`, fullPage: true });
  await page.getByRole('button', { name: 'Finish preview' }).click();
  await expect(page.getByRole('heading', { name: 'Your guided flow is complete.' })).toBeVisible();
  await expect(
    page.getByText('No records were sent to Zoho Creator.', { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
test('utility PO requirement, date estimate, and equipment rows', async ({ page }) => {
  await page.goto('/widget.html');
  await details(page, 'Sub 5MW PV&Storage');
  await location(page);
  await page.getByLabel('EXW factory date', { exact: true }).fill('2026-10-31');
  await expect(page.getByLabel('Estimated commission date')).toHaveValue('2027-02-28');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByText('Add at least one purchase order for this project type.').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add purchase order', exact: true }).click();
  await page.getByLabel('PO number', { exact: false }).fill('PO-2026-014');
  await page.getByLabel('PO date', { exact: false }).fill('2026-09-17');
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await pick(page, 'Model', 'Sample PV inverter');
  await page.getByLabel('Quantity', { exact: false }).fill('2');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByText('PO-2026-014', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});
test('changing client clears site and changing country resets state', async ({ page }) => {
  await page.goto('/widget.html');
  await details(page);
  await pick(page, 'Client', 'Riverbank Energy (sample)');
  await pick(page, 'Site', 'Riverbank site (sample)');
  await pick(page, 'Client', 'Coastal Solar (sample)');
  await expect(page.getByRole('combobox', { name: 'Site', exact: true })).toHaveValue('');
  await pick(page, 'Country', 'Australia');
  await page.getByLabel('State', { exact: false }).selectOption('NSW');
  await pick(page, 'Country', 'New Zealand');
  await expect(page.getByLabel('State', { exact: false })).toHaveCount(0);
});

test('project activities validate, retain conditional values, and appear in review', async ({
  page,
}, info) => {
  await page.goto('/widget.html');
  await details(page, 'C&I - Project Team');
  await location(page);
  await page.locator('summary').filter({ hasText: 'Issue register' }).click();
  await page.getByRole('button', { name: 'Add issue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Please enter issue level.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Issue 1 · Issue level', exact: true }).click();
  await expect(page.getByLabel('Issue level')).toBeFocused();
  await page.getByLabel('Issue subject', { exact: true }).fill('Controller fault');
  await page.getByLabel('Issue level').selectOption('Major');
  await page.getByLabel('Issue type').selectOption('Hardware');
  await page.locator('summary').filter({ hasText: 'Software changes' }).click();
  await page.getByRole('button', { name: 'Add software change', exact: true }).click();
  await pick(page, 'MCU', 'Sample battery controller');
  await page.getByLabel('Software type', { exact: false }).selectOption('General Availability');
  await pick(page, 'Upgrade engineer', 'Alex Chen (sample)');
  await page.getByLabel('Upgrade method').selectOption('Remote');
  await page.getByLabel('Target version').fill('2.1');
  await page.locator('summary').filter({ hasText: 'Rectifications' }).click();
  await page.getByRole('button', { name: 'Add rectification', exact: true }).click();
  await pick(page, 'Rectification ID', 'RECT-EXAMPLE-001');
  await page.getByLabel('Changed software type').selectOption('Master');
  await expect(page.getByLabel('Updated software version')).toHaveValue('2.0 (sample)');
  await page.getByLabel('Rectification serial number').fill('DEMO-001');
  await page.getByLabel('Rectification serial number').blur();
  await expect(page.getByLabel('Product code', { exact: true })).toHaveValue('DEMO-001');
  await expect(page.getByLabel('Product model name', { exact: true })).toHaveValue(
    'Sample inverter',
  );
  await page.locator('summary').filter({ hasText: 'Warranty tickets' }).click();
  await page.getByRole('button', { name: 'Add warranty ticket', exact: true }).click();
  await pick(page, 'Project claim', 'CSR-EXAMPLE-001');
  await page.getByLabel('Items', { exact: true }).fill('Controller board');
  await page.screenshot({
    path: `test-results/${info.project.name}-activities.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByText('Controller fault', { exact: true })).toBeVisible();
  await expect(page.getByText('2.1', { exact: true })).toBeVisible();
  await expect(page.getByText('RECT-EXAMPLE-001', { exact: true })).toBeVisible();
  await expect(page.getByText('CSR-EXAMPLE-001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Issue subject', { exact: true })).toHaveValue('Controller fault');
});

test('bulk BOM matches samples, validates unknown serials, and shows model totals', async ({
  page,
}) => {
  await page.goto('/widget.html');
  await details(page, 'C&I - Project Team');
  await location(page);
  await page.getByText('Import serial numbers', { exact: true }).click();
  await page.getByLabel('Serial numbers', { exact: true }).fill('DEMO-001;\n DEMO-002\nUNKNOWN');
  await page.getByRole('button', { name: 'Add serial numbers to BOM', exact: true }).click();
  await expect(page.getByText('3 items added.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Please enter a product model.').first()).toBeVisible();
  const models = page.getByRole('combobox', { name: 'Product model', exact: true });
  await models.nth(2).fill('Sample battery');
  await page.getByRole('option', { name: 'Sample battery · DEMO-002', exact: true }).click();
  await page.getByText('View totals by model', { exact: true }).click();
  await expect(page.getByText('2 units · 2 serial numbers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByText('SN: UNKNOWN', { exact: true })).toBeVisible();
});

test('channel service requests start with current staff and retain editable request details', async ({
  page,
}) => {
  await page.goto('/widget.html');
  await details(page);
  await location(page);
  await page.getByRole('button', { name: 'Add request', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Alex Chen (sample)', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Subject', { exact: false }).fill('Remote support');
  await page.getByLabel('External reference').fill('EXT-100');
  await expect(page.getByLabel('Request address')).toHaveValue('Online');
  await pick(page, 'Team', 'Service (sample)');
  await page.getByLabel('Service type').selectOption('Inspection');
  await page.getByLabel('External or internal').selectOption('Internal');
  await page.getByLabel('Start date').fill('2026-09-18');
  await page.getByLabel('Close date').fill('2026-09-19');
  await page.getByLabel('Request status').selectOption('Closed');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Remote support', { exact: true })).toBeVisible();
  await expect(page.getByText('External reference: EXT-100', { exact: true })).toBeVisible();
  await expect(page.getByText('Address: Online', { exact: true })).toBeVisible();
});

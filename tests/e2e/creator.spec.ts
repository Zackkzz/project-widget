import { test, expect } from '@playwright/test';

test('embedded SDK flow submits one Project payload and keeps native workflows enabled', async ({
  page,
}) => {
  // An isolated same-origin host exercises the embedded path. Every SDK operation is a local stub.
  await page.addInitScript(() => {
    const state = window as unknown as {
      ZOHO: unknown;
      submissions: unknown[];
      navigations: unknown[];
      lookupReports: string[];
    };
    state.submissions = [];
    state.navigations = [];
    state.lookupReports = [];
    const records: Record<string, unknown[]> = {
      Clients: [{ ID: '100000000000000001', Business_Name: 'Test client' }],
      Countries: [
        { ID: '100000000000000002', Country_Name: 'Australia', States: [{ State: 'NSW' }] },
      ],
      Staff_List: [{ ID: '100000000000000003', Staff_name: 'Test engineer' }],
      Sales_List: [
        {
          ID: '301',
          Name: 'Test salesperson',
          Staff: { ID: '302', zc_display_value: 'Test salesperson' },
        },
      ],
      C4_Report: [
        { ID: '401', C4_Number: '' },
        { ID: '402', C4_Number: 'C4-TEST' },
      ],
    };
    state.ZOHO = {
      CREATOR: {
        UTIL: {
          getInitParams: async () => ({
            appLinkName: 'sungrowauservice',
            loginUser: 'test@example.invalid',
          }),
          navigateParentURL: async (config: unknown) => {
            state.navigations.push(config);
            return {};
          },
        },
        DATA: {
          getRecords: async (config: { report_name: string; record_cursor?: string }) => {
            state.lookupReports.push(config.report_name);
            if (config.report_name === 'Sites')
              throw {
                status: 400,
                responseText: JSON.stringify({
                  code: 9280,
                  message: 'No records found matching the given criteria.',
                }),
              };
            if (config.report_name === 'Project_Managers') {
              return config.record_cursor
                ? { code: 3000, data: [{ ID: '2026', Name: 'Manager 26' }] }
                : {
                    code: 3000,
                    data: [
                      { ID: '1999', Name: '' },
                      { ID: '2000', Name: '' },
                      ...Array.from({ length: 25 }, (_, index) => ({
                        ID: String(2001 + index),
                        Name: `Manager ${index + 1}`,
                      })),
                    ],
                    record_cursor: 'managers-page2',
                  };
            }
            return records[config.report_name]
              ? { code: 3000, data: records[config.report_name] }
              : { code: 3100 };
          },
          addRecords: async (config: unknown) => {
            state.submissions.push(config);
            await new Promise((resolve) => setTimeout(resolve, 300));
            return {
              code: 3000,
              data: { ID: '100000000000000099', Project_ID: 'LOCAL-TEST-ONLY' },
            };
          },
        },
      },
    };
  });
  await page.route('**/mock-creator-host', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<iframe name="widget" title="Widget" src="/widget.html" style="width:100%;height:95vh;border:0"></iframe>',
    }),
  );
  await page.goto('/mock-creator-host');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: 'Create a project', exact: true })).toBeVisible();
  await frame.getByLabel('Project type').selectOption('C&I - Project Team');
  await frame.getByLabel('Grid-GFL', { exact: true }).check();
  await frame.getByLabel('Coupling type').selectOption('AC Coupling');
  await frame.getByRole('button', { name: 'Continue', exact: true }).click();
  const fetchedReports = () =>
    page
      .frame({ name: 'widget' })!
      .evaluate(() => (window as unknown as { lookupReports: string[] }).lookupReports);
  await expect
    .poll(fetchedReports)
    .toEqual(expect.arrayContaining(['Clients', 'Project_Managers', 'C4_Report']));
  expect(await fetchedReports()).not.toContain('Sites');
  await frame.getByRole('combobox', { name: 'Project manager', exact: true }).click();
  const managers = frame.getByRole('listbox', { name: 'Project manager', exact: true });
  await expect(managers.getByRole('option')).toHaveCount(25);
  await managers.locator('..').evaluate((menu) => {
    menu.scrollTop = menu.scrollHeight;
  });
  await expect(managers.getByRole('option')).toHaveCount(26);
  await managers.getByRole('option', { name: 'Manager 26', exact: true }).click();
  await frame.getByRole('combobox', { name: 'Sales', exact: true }).click();
  await frame.getByRole('option', { name: 'Test salesperson', exact: true }).click();
  await frame.getByRole('combobox', { name: 'C4 references', exact: true }).click();
  await expect(
    frame.getByRole('listbox', { name: 'C4 references' }).getByRole('option'),
  ).toHaveCount(1);
  await frame.getByRole('option', { name: 'C4-TEST', exact: true }).click();
  await frame.getByRole('combobox', { name: 'Client', exact: true }).click();
  await frame.getByRole('option', { name: 'Test client' }).click();
  await expect.poll(fetchedReports).toContain('Sites');
  await frame.getByRole('combobox', { name: 'Site', exact: true }).click();
  await expect(frame.getByText('Type to search for records.', { exact: true })).toBeVisible();
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await frame.getByRole('combobox', { name: 'Country', exact: true }).click();
  await frame.getByRole('option', { name: 'Australia' }).click();
  const stateField = frame.getByLabel('State', { exact: false });
  await expect(stateField).toHaveAttribute('id', 'State');
  await frame.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(stateField).toHaveAttribute('aria-invalid', 'true');
  await frame.getByRole('button', { name: 'State', exact: true }).click();
  await expect(stateField).toBeFocused();
  await stateField.selectOption('NSW');
  await frame.getByRole('button', { name: 'Continue', exact: true }).click();
  await frame.locator('summary').filter({ hasText: 'Internal service tickets' }).click();
  await frame.getByRole('button', { name: 'Add service ticket', exact: true }).click();
  await frame.getByLabel('Ticket subject').fill('Scheduled inspection');
  await frame.getByLabel('Ticket service type').selectOption('Inspection');
  await frame.getByRole('combobox', { name: 'Ticket staff', exact: true }).fill('Test engineer');
  await frame.getByRole('option', { name: 'Test engineer' }).click();
  await frame.getByLabel('Start time (Sydney)').fill('2099-01-01T09:00');
  await frame.getByLabel('Aimed end time (Sydney)').fill('2099-01-01T17:00');
  await expect(frame.getByLabel('Ticket status')).toHaveValue('Pending');
  await frame.getByLabel('Ticket address').selectOption('Online');
  await frame.getByRole('button', { name: 'Continue', exact: true }).click();
  await frame.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(frame.getByText('LOCAL-TEST-ONLY', { exact: true })).toBeVisible();
  const payloads = await page
    .frame({ name: 'widget' })!
    .evaluate(() => (window as unknown as { submissions: Record<string, unknown>[] }).submissions);
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({
    form_name: 'Project',
    payload: {
      data: {
        Client: '100000000000000001',
        Project_Manager: '2026',
        Sales: '301',
        C4: ['402'],
        State: 'NSW',
        Service_Tickets: [
          {
            Subject_field: 'Scheduled inspection',
            Created_By: '100000000000000003',
            Staff: ['100000000000000003'],
            Start_Time: '01/01/2099 09:00:00',
            Aimed_End_Time: '01/01/2099 17:00:00',
            Is_Subform: true,
            Status: 'Pending',
          },
        ],
      },
    },
  });
  expect(payloads[0].payload).not.toHaveProperty('skip_workflow');
  expect(payloads[0]).not.toHaveProperty('payload.data.new_state');
  expect(payloads[0]).not.toHaveProperty('payload.data.New_State');
  await frame.getByRole('button', { name: 'Open project', exact: true }).click();
  const navigations = await page
    .frame({ name: 'widget' })!
    .evaluate(() => (window as unknown as { navigations: unknown[] }).navigations);
  expect(navigations).toEqual([
    expect.objectContaining({
      url: '#Report:Project_Report?recLinkID=100000000000000099&viewLinkName=Project_Report',
    }),
  ]);
});

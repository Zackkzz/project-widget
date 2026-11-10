import { describe, expect, it, vi } from 'vitest';
import {
  connectCreator,
  criteriaString,
  parseCreated,
  parseLookup,
} from '../app/src/services/creator';
function sdk() {
  return {
    DATA: { getRecords: vi.fn(), addRecords: vi.fn() },
    UTIL: {
      getInitParams: vi.fn().mockResolvedValue({ appLinkName: 'sungrowauservice' }),
      navigateParentURL: vi.fn(),
    },
  };
}
describe('Creator adapter', () => {
  it.each([
    ['managers', 'Name'],
    ['c4', 'C4_Number'],
  ] as const)('keeps usable %s records when other labels are blank', async (source, field) => {
    const mock = sdk();
    mock.DATA.getRecords.mockResolvedValue({
      code: 3000,
      data: [
        { ID: '1', [field]: '' },
        { ID: '2', [field]: '   ' },
        { ID: '3', [field]: null },
        { ID: '3932750000195559074', [field]: 'Valid label' },
      ],
    });
    const gateway = await connectCreator(mock);
    expect((await gateway.lookup(source, '')).options).toEqual([
      { id: '3932750000195559074', label: 'Valid label' },
    ]);
  });

  it('keeps pagination when a whole page has blank labels', async () => {
    const mock = sdk();
    mock.DATA.getRecords
      .mockResolvedValueOnce({
        responseText: { code: 3000, data: [{ ID: '1', Name: '' }] },
        headers: { record_cursor: 'next-page' },
      })
      .mockResolvedValueOnce({ code: 3000, data: [{ ID: '2', Name: 'Manager' }] });
    const gateway = await connectCreator(mock);
    expect(await gateway.lookup('managers', '')).toEqual({ options: [], cursor: 'next-page' });
    expect((await gateway.lookup('managers', '', undefined, 'next-page')).options).toEqual([
      { id: '2', label: 'Manager' },
    ]);
  });

  it('reports omitted or unreadable fields instead of hiding schema failures', async () => {
    const mock = sdk();
    const gateway = await connectCreator(mock);
    mock.DATA.getRecords.mockResolvedValue({ code: 3000, data: [{ ID: '1' }] });
    await expect(gateway.lookup('managers', '')).rejects.toThrow('did not return Name');
    mock.DATA.getRecords.mockResolvedValue({ code: 3000, data: [{ ID: '1', Name: {} }] });
    await expect(gateway.lookup('managers', '')).rejects.toThrow('unreadable Name');
  });

  it('uses the Sales record ID and plain Name even when a nested Staff lookup is returned', async () => {
    const mock = sdk();
    mock.DATA.getRecords.mockResolvedValue({
      code: 3000,
      data: [
        { ID: '123', Name: 'Sales person', Staff: { ID: '456', zc_display_value: 'Staff name' } },
      ],
    });
    const gateway = await connectCreator(mock);
    expect((await gateway.lookup('sales', '')).options).toEqual([
      { id: '123', label: 'Sales person' },
    ]);
    expect(mock.DATA.getRecords).toHaveBeenCalledWith(expect.objectContaining({ fields: 'Name' }));
  });

  it.each([3100, 9280])(
    'treats resolved and rejected code %s as empty report reads',
    async (code) => {
      const mock = sdk();
      const gateway = await connectCreator(mock);
      mock.DATA.getRecords.mockResolvedValue({ code, message: 'No records found' });
      expect(await gateway.lookup('sites', '', '3932750000199338800')).toEqual({ options: [] });
      mock.DATA.getRecords.mockRejectedValue({ code: String(code) });
      expect(await gateway.lookup('sites', '', '3932750000199338800')).toEqual({ options: [] });
      mock.DATA.getRecords.mockRejectedValue({
        status: 400,
        responseText: JSON.stringify({ code }),
      });
      expect(await gateway.lookup('sites', '', '3932750000199338800')).toEqual({ options: [] });
      expect(await gateway.serialDetails('not-found')).toBeNull();
    },
  );

  it('preserves genuine API errors and their diagnostic descriptions', async () => {
    const mock = sdk();
    const gateway = await connectCreator(mock);
    mock.DATA.getRecords.mockRejectedValue({ responseText: { code: 2945, description: 'Z223' } });
    await expect(gateway.lookup('sites', '', '123')).rejects.toThrow(
      'Zoho request failed (code 2945): Z223',
    );
    mock.DATA.getRecords.mockResolvedValue({ code: 2894, message: 'Permission denied' });
    await expect(gateway.lookup('managers', '')).rejects.toThrow('Permission denied');
  });

  it('does not apply empty-read handling to creation errors', async () => {
    const mock = sdk();
    mock.DATA.addRecords.mockResolvedValue({ code: 9280, message: 'Creation rejected' });
    const gateway = await connectCreator(mock);
    await expect(gateway.create({})).rejects.toThrow('Creation rejected');
  });

  it('accepts both SDK and REST-style record results', () => {
    expect(parseCreated({ code: 3000, data: { ID: '100000000000000001' } }).id).toBe(
      '100000000000000001',
    );
    expect(
      parseCreated({
        code: 3000,
        result: [{ code: 3000, data: { ID: '100000000000000001', Project_ID: 'AUDEMO' } }],
      }).projectId,
    ).toBe('AUDEMO');
    expect(() =>
      parseCreated({ code: 3000, result: [{ code: 3001, message: 'Validation failed' }] }),
    ).toThrow('Validation failed');
  });
  it('rejects imprecise numeric IDs and missing country state metadata', () => {
    expect(() => parseLookup('clients', { ID: 100000000000000001, Business_Name: 'X' })).toThrow(
      'unsafe',
    );
    expect(() => parseLookup('countries', { ID: '123', Country_Name: 'Australia' })).toThrow(
      'States',
    );
    expect(
      parseLookup('countries', {
        ID: '123',
        Country_Name: 'Australia',
        States: [{ zc_display_value: { State: 'NSW' } }],
      }).states,
    ).toEqual(['NSW']);
  });
  it('escapes search literals and filters sites by the client ID', async () => {
    expect(criteriaString('a"b\\c')).toBe('"a\\"b\\\\c"');
    const mock = sdk();
    mock.DATA.getRecords.mockResolvedValue({ code: 3000, data: [] });
    const gateway = await connectCreator(mock);
    await gateway.lookup('sites', '"test', '12345');
    expect(mock.DATA.getRecords.mock.calls[0][0].criteria).toContain('(Client == 12345)');
    expect(mock.DATA.getRecords.mock.calls[0][0].criteria).toContain('\\"test');
    await expect(gateway.lookup('sites', 'x', '123 || true')).rejects.toThrow('valid client');
  });
  it('preserves existing workflows and never retries record creation', async () => {
    const mock = sdk();
    mock.DATA.addRecords.mockResolvedValue({ code: 3000, data: { ID: '12345' } });
    const gateway = await connectCreator(mock);
    await gateway.create({ Project_Type: 'Utility' });
    expect(mock.DATA.addRecords).toHaveBeenCalledTimes(1);
    expect(mock.DATA.addRecords.mock.calls[0][0].payload).not.toHaveProperty('skip_workflow');
    mock.DATA.addRecords.mockRejectedValue(new Error('Network failure'));
    await expect(gateway.create({})).rejects.toMatchObject({ uncertain: true });
    expect(mock.DATA.addRecords).toHaveBeenCalledTimes(2);
  });
  it('surfaces validation errors without claiming a successful creation', async () => {
    const mock = sdk();
    mock.DATA.addRecords.mockResolvedValue({ code: 3001, message: 'PO required' });
    const gateway = await connectCreator(mock);
    await expect(gateway.create({})).rejects.toThrow('PO required');
  });
  it.each(['resolved', 'rejected'] as const)(
    'shows the actual State validation error from a %s Add Records response',
    async (delivery) => {
      const mock = sdk();
      const response = { code: 3001, error: ['Invalid column value for State'] };
      if (delivery === 'resolved') mock.DATA.addRecords.mockResolvedValue(response);
      else
        mock.DATA.addRecords.mockRejectedValue({
          status: 200,
          responseText: JSON.stringify(response),
        });
      const gateway = await connectCreator(mock);
      await expect(gateway.create({ State: 'NSW' })).rejects.toMatchObject({
        message: 'Invalid column value for State',
        uncertain: false,
      });
      expect(mock.DATA.addRecords).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps validation details when Zoho also supplies a generic message', () => {
    expect(() =>
      parseCreated({
        code: 3001,
        message: 'Validation failed',
        error: ['Invalid column value for State', '', 'Check the field choices'],
      }),
    ).toThrow('Invalid column value for State\nCheck the field choices');
    expect(() => parseCreated({ code: 3001, error: 'Invalid column value for State' })).toThrow(
      'Invalid column value for State',
    );
  });
  it('handles empty reports and cursor pagination', async () => {
    const mock = sdk();
    mock.DATA.getRecords
      .mockResolvedValueOnce({ code: 3100, message: 'No records found' })
      .mockResolvedValueOnce({
        code: 3000,
        data: [{ ID: '123', Business_Name: 'X' }],
        record_cursor: 'next-page',
      });
    const gateway = await connectCreator(mock);
    expect((await gateway.lookup('clients', '')).options).toEqual([]);
    expect((await gateway.lookup('clients', '')).cursor).toBe('next-page');
  });
});

describe('Activity reads and creation certainty', () => {
  it('marks malformed success/error responses as unknown instead of allowing unsafe retries', () => {
    for (const response of [
      {},
      { code: 3000 },
      { code: 3000, result: [] },
      { responseText: 'not json' },
    ]) {
      try {
        parseCreated(response);
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toMatchObject({ uncertain: true });
      }
    }
  });
  it('uses the exact engineer and rectification filters', async () => {
    const mock = sdk();
    mock.DATA.getRecords
      .mockResolvedValueOnce({ code: 3000, data: [{ ID: '55', Team: 'Service' }] })
      .mockResolvedValue({ code: 3100 });
    const gateway = await connectCreator(mock);
    await gateway.lookup('engineers', 'Alex');
    expect(mock.DATA.getRecords.mock.lastCall![0].criteria).toContain(
      '(Team == 55) && Location == "Australia"',
    );
    await gateway.lookup('rectifications', 'RECT');
    expect(mock.DATA.getRecords.mock.lastCall![0].criteria).toContain(
      'Rectification_Project != null',
    );
    expect(mock.DATA.getRecords.mock.lastCall![0].max_records).toBe(1000);
  });
  it('checks pending ticket endpoints using string IDs and formatted application times', async () => {
    const mock = sdk();
    mock.DATA.getRecords
      .mockResolvedValueOnce({ code: 3000, data: [{ Subject_field: 'Existing visit' }] })
      .mockResolvedValueOnce({ code: 3100 });
    const gateway = await connectCreator(mock);
    const errors = await gateway.checkTickets([
      {
        key: 'row',
        values: {
          Staff: [{ id: '100000000000000001', label: 'Alex' }],
          Start_Time: '2026-09-18T09:00',
          Aimed_End_Time: '2026-09-18T17:00',
        },
      },
    ]);
    expect(errors['Service_Tickets.0.Start_Time']).toContain('Existing visit');
    expect(errors).not.toHaveProperty('Service_Tickets.0.Aimed_End_Time');
    expect(mock.DATA.getRecords.mock.calls[0][0].criteria).toContain(
      'Staff.contains(100000000000000001)',
    );
    expect(mock.DATA.getRecords.mock.calls[0][0].criteria).toContain("'18/09/2026 09:00:00'");
  });
  it('fails closed on unreadable conflict reports before any write', async () => {
    const mock = sdk();
    mock.DATA.getRecords.mockResolvedValue({ code: 2894, message: 'Permission denied' });
    const gateway = await connectCreator(mock);
    await expect(
      gateway.checkTickets([
        {
          key: 'row',
          values: { Staff: [{ id: '1', label: 'A' }], Start_Time: '2026-09-18T09:00' },
        },
      ]),
    ).rejects.toThrow('Permission denied');
    expect(mock.DATA.addRecords).not.toHaveBeenCalled();
  });
  it('preserves the native service-ticket creator without mutating caller data', async () => {
    const mock = sdk();
    mock.UTIL.getInitParams.mockResolvedValue({
      appLinkName: 'sungrowauservice',
      loginUser: 'alex@example.com',
    });
    mock.DATA.getRecords.mockResolvedValue({
      code: 3000,
      data: [{ ID: '123', Staff_name: 'Alex' }],
    });
    mock.DATA.addRecords.mockResolvedValue({ code: 3000, data: { ID: '456' } });
    const gateway = await connectCreator(mock);
    const input = { Service_Tickets: [{ Subject_field: 'Visit' }] };
    await gateway.create(input);
    expect(mock.DATA.addRecords.mock.lastCall![0].payload.data.Service_Tickets[0].Created_By).toBe(
      '123',
    );
    expect(input.Service_Tickets[0]).not.toHaveProperty('Created_By');
  });
});

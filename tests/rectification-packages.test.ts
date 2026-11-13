import { describe, expect, it, vi } from 'vitest';
import { loadRectificationPackages } from '../app/src/services/rectificationPackages';
import { connectCreator } from '../app/src/services/creator';

const software = (id: string, packages?: unknown) => ({
  ID: id,
  Rectification_ID: 'RECT-11',
  Type_field: 'Software',
  Fault: [],
  Rectification_Project: { ID: '3932750000199999999', zc_display_value: 'Parent' },
  Product_Line: { ID: '125', zc_display_value: 'Storage' },
  ...(packages !== undefined ? { Software_Packages: packages } : {}),
});

describe('Linked rectification software packages', () => {
  it('uses parent packages even when the child report returns an empty or stale value', async () => {
    const packages = [{ Software_Type: 'Master', Software_Version: '2.0' }];
    const read = vi
      .fn()
      .mockResolvedValue([{ ID: '3932750000199999999', Software_Packages: packages }]);
    const rows = [
      software('1', []),
      software('2', [{ Software_Type: 'Old', Software_Version: '1' }]),
    ];
    const result = await loadRectificationPackages(rows, read);
    expect(read).toHaveBeenCalledExactlyOnceWith(['3932750000199999999']);
    expect(result.map((row) => row.Software_Packages)).toEqual([packages, packages]);
    expect(rows[0].Software_Packages).toEqual([]);
  });

  it('does not fetch software packages for hardware records', async () => {
    const read = vi.fn();
    const rows = [{ ID: '1', Type_field: 'Hardware' }];
    expect(await loadRectificationPackages(rows, read)).toBe(rows);
    expect(read).not.toHaveBeenCalled();
  });

  it('accepts an explicitly empty parent but reports missing access instead of using stale data', async () => {
    const rows = [software('1', [{ Software_Type: 'Stale', Software_Version: '1' }])];
    expect(
      (
        await loadRectificationPackages(rows, async () => [
          { ID: '3932750000199999999', Software_Packages: null },
        ])
      )[0].Software_Packages,
    ).toEqual([]);
    await expect(loadRectificationPackages(rows, async () => [])).rejects.toThrow(
      'Check report and field access',
    );
    await expect(
      loadRectificationPackages(rows, async () => {
        throw new Error('Permission denied');
      }),
    ).rejects.toThrow('Permission denied');
    await expect(
      loadRectificationPackages(
        [{ ...rows[0], Rectification_Project: { ID: '1 || true' } }],
        vi.fn(),
      ),
    ).rejects.toThrow('valid linked');
  });

  it('batches parent reads with bounded request size', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      ...software(String(i)),
      Rectification_Project: { ID: String(100 + i) },
    }));
    const sizes: number[] = [];
    await loadRectificationPackages(rows, async (ids) => {
      sizes.push(ids.length);
      return ids.map((ID) => ({ ID, Software_Packages: [] }));
    });
    expect(sizes).toEqual([25, 25, 1]);
  });

  it('preserves lookup pagination and resolves package choices through the parent report', async () => {
    const getRecords = vi
      .fn()
      .mockResolvedValueOnce({ code: 3000, data: [software('123', [])], record_cursor: 'next' })
      .mockResolvedValueOnce({
        code: 3000,
        data: [
          {
            ID: '3932750000199999999',
            Software_Packages: [{ Software_Type: 'Master', Software_Version: '2.0' }],
          },
        ],
      });
    const gateway = await connectCreator({
      DATA: { getRecords, addRecords: vi.fn() },
      UTIL: {
        getInitParams: vi.fn().mockResolvedValue({ appLinkName: 'sungrowauservice' }),
        navigateParentURL: vi.fn(),
      },
    });
    const result = await gateway.lookup('rectifications', 'RECT');
    expect(result.cursor).toBe('next');
    expect(result.options[0].rectification?.packages).toEqual([{ type: 'Master', version: '2.0' }]);
    expect(getRecords.mock.calls[0][0].fields).not.toContain('Software_Packages');
    expect(getRecords.mock.calls[1][0]).toMatchObject({
      report_name: 'Rectification_Projects',
      fields: 'Software_Packages',
      criteria: '(ID == 3932750000199999999)',
    });
  });
});

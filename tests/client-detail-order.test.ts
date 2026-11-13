import { describe, expect, it } from 'vitest';
import { compareClientDetailFields } from '../app/src/domain/clientDetailOrder';
const sort = (fields: string[]) =>
  [...fields].sort((a, b) => compareClientDetailFields(a, b, (name) => name));
describe('Native Client detail order', () => {
  it('puts identity and linked projects before capacities, with State before Country', () => {
    expect(
      sort([
        'Country',
        'BESS_Capacity',
        'C4',
        'Project',
        'ABN',
        'Business_Name',
        'PCS_Capacity',
        'Inverter_Capacity',
        'State',
      ]),
    ).toEqual([
      'Business_Name',
      'ABN',
      'Project',
      'C4',
      'PCS_Capacity',
      'BESS_Capacity',
      'Inverter_Capacity',
      'State',
      'Country',
    ]);
  });
  it('uses the same slot for enriched Projects and native Project fields', () => {
    expect(sort(['Note', 'Projects', 'Email', 'Business_Name'])).toEqual([
      'Business_Name',
      'Projects',
      'Email',
      'Note',
    ]);
    expect(sort(['Added_Time', 'Added_By', 'Trashed', 'Team'])).toEqual([
      'Team',
      'Added_By',
      'Added_Time',
      'Trashed',
    ]);
  });
  it('preserves new report fields after the known fields with an alphabetical fallback', () => {
    const fields = ['New_Z', 'Business_Name', 'New_A', 'ABN'];
    expect(sort(fields)).toEqual(['Business_Name', 'ABN', 'New_A', 'New_Z']);
    expect(fields[0]).toBe('New_Z');
  });
});

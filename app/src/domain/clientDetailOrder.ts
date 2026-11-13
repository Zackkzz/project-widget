/** Client detail order follows the native Client form, rather than Project fields or API key order. */
export const CLIENT_DETAIL_FIELDS = [
  'Business_Name',
  'ABN',
  'Project',
  'C4',
  'PCS_Capacity',
  'BESS_Capacity',
  'Inverter_Capacity',
  'Office_Address',
  'Postcode',
  'Contact_Name',
  'Email',
  'Phone_Number',
  'State',
  'Country',
  'Customer_Type',
  'Priority',
  'Note',
  'Service_Ticket_Default',
  'Distributors',
  'Follow_Up_Frequency',
  'Last_Meeting',
  'Meeting_Note',
  'Main_Product_Used',
  'Installs_Per_Month',
  'Switch_to_Sungrow',
  'Used_Sungrow_Before',
  'Team',
  'Added_User',
  'Added_Time',
  'Trashed',
] as const;
const positions = new Map<string, number>(CLIENT_DETAIL_FIELDS.map((name, index) => [name, index]));
const aliases: Record<string, string> = {
  Projects: 'Project',
  Added_By: 'Added_User',
  Phone: 'Phone_Number',
  C4_Legacy: 'C4',
};

/** Preserve every returned field; additional report fields follow the requested fields alphabetically. */
export function compareClientDetailFields(
  left: string,
  right: string,
  label: (name: string) => string,
): number {
  const rank = (name: string) => positions.get(aliases[name] ?? name) ?? positions.size;
  return rank(left) - rank(right) || label(left).localeCompare(label(right));
}

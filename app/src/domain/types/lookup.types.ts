/** Creator record IDs must remain strings: they can exceed Number.MAX_SAFE_INTEGER. */
export interface LookupOption {
  id: string;
  label: string;
  states?: string[];
  rectification?: {
    parentId: string;
    gspNumber?: string;
    type: 'Hardware' | 'Software';
    productLine: LookupOption;
    faults: LookupOption[];
    packages: { type: string; version: string }[];
  };
}

import type { LookupOption } from '../domain/types/lookup.types';
import type { Source, Gateway } from './types/creator.types';

const options = (labels: string[], prefix: string): LookupOption[] =>
  labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label }));
const samples: Record<Source, LookupOption[]> = {
  clients: options(
    ['Riverbank Energy (sample)', 'Coastal Solar (sample)', 'Northfield Renewables (sample)'],
    'preview-client-',
  ),
  countries: [
    {
      id: 'preview-au',
      label: 'Australia',
      states: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'],
    },
    { id: 'preview-nz', label: 'New Zealand', states: [] },
  ],
  sites: [],
  managers: options(['Alex Chen (sample)', 'Jordan Lee (sample)'], 'preview-manager-'),
  sales: options(['Taylor Morgan (sample)'], 'preview-sales-'),
  distributors: options(['Example Distribution (sample)'], 'preview-distributor-'),
  c4: options(['C4-EXAMPLE-001', 'C4-EXAMPLE-002'], 'preview-c4-'),
  models: options(['Sample PV inverter', 'Sample storage system'], 'preview-model-'),
  products: options(
    ['Sample inverter · DEMO-001', 'Sample battery · DEMO-002'],
    'preview-product-',
  ),
  warranties: options(['Sample standard warranty'], 'preview-warranty-'),
  staff: options(['Alex Chen (sample)', 'Jordan Lee (sample)'], 'preview-staff-'),
  teams: options(['Service (sample)', 'Technical (sample)'], 'preview-team-'),
  claims: options(['CSR-EXAMPLE-001'], 'preview-claim-'),
  mcus: options(['Sample battery controller'], 'preview-mcu-'),
  engineers: options(['Alex Chen (sample)'], 'preview-engineer-'),
  spareParts: options(['Sample replacement board · DEMO-003'], 'preview-spare-'),
  faults: options(['SAMPLE-FAULT'], 'preview-fault-'),
  rectifications: [
    {
      id: 'preview-rectification-1',
      label: 'RECT-EXAMPLE-001',
      rectification: {
        parentId: 'preview-parent-1',
        type: 'Software',
        productLine: { id: 'preview-line-1', label: 'Sample storage' },
        faults: [{ id: 'preview-fault-1', label: 'SAMPLE-FAULT' }],
        packages: [{ type: 'Master', version: '2.0 (sample)' }],
      },
    },
  ],
};
export const previewGateway: Gateway = {
  mode: 'preview',
  async currentStaff() {
    return samples.staff[0];
  },
  async serialDetails(serial) {
    return serial.startsWith('DEMO-')
      ? { code: 'DEMO-001', model: 'Sample inverter', product: samples.products[0] }
      : null;
  },
  async checkTickets() {
    return {};
  },
  async lookup(source, query, clientId) {
    const records =
      source === 'sites'
        ? clientId
          ? [
              {
                id: `preview-site-${clientId}`,
                label: clientId.endsWith('2')
                  ? 'Coastal Solar site (sample)'
                  : 'Riverbank site (sample)',
              },
            ]
          : []
        : samples[source];
    return { options: records.filter((r) => r.label.toLowerCase().includes(query.toLowerCase())) };
  },
  async create() {
    throw new Error('Preview mode cannot create records.');
  },
  async openProject() {
    throw new Error('No live project exists in preview mode.');
  },
  async openForm() {
    throw new Error('Native Creator forms are available inside the live widget.');
  },
};

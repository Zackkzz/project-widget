export interface CachedRecord {
  id: string;
  raw: Record<string, unknown>;
  country?: unknown;
  reportBaseline?: boolean;
}

export interface RecordPage {
  records: CachedRecord[];
  cursor?: string;
}

export interface ProjectSnapshot {
  id: string;
  record?: CachedRecord;
  bom?: CachedRecord[];
  projectFetchedAt?: number;
  bomFetchedAt?: number;
  accessedAt: number;
  bytes: number;
}

export interface StoredSnapshot extends ProjectSnapshot {
  scope: string;
}

export interface RecordsGateway {
  list(query: unknown): Promise<RecordPage>;
  get(id: string): Promise<CachedRecord>;
  bom(id: string, cursor?: string): Promise<RecordPage>;
  getBom(id: string): Promise<CachedRecord>;
  getBomFields?(id: string, fields: string[]): Promise<CachedRecord>;
  [name: string]: unknown;
}

export interface CreatorSdk {
  DATA: Record<string, (...args: never[]) => unknown>;
  [name: string]: unknown;
}

export interface CacheScope {
  user?: string;
  app: string;
}

export interface CacheLimits {
  memoryProjects: number;
  memoryBytes: number;
  diskBytes: number;
  maxAgeMs: number;
  freshMs: number;
}

export interface TorrentData {
  hash: string;
  name: string;
  progress: number;
  state: TorrentState;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number;
  num_seeds: number;
  num_leechs: number;
  added_on: number;
  completed?: number;
}

export type TorrentState =
  | 'downloading'
  | 'uploading'
  | 'pausedDL'
  | 'pausedUP'
  | 'stalledDL'
  | 'stalledUP'
  | 'queuedDL'
  | 'queuedUP'
  | 'checkingDL'
  | 'checkingUP'
  | 'forcedDL'
  | 'forcedUP'
  | 'metaDL'
  | 'allocating'
  | 'error'
  | 'missingFiles';

export interface TLSConfig {
  rejectUnauthorized?: boolean;
  ca?: string | string[];
  cert?: string;
  key?: string;
  passphrase?: string;
  minVersion?: string;
  maxVersion?: string;
}

export interface ConnectionConfig {
  host: string;
  username?: string;
  password?: string;
  tls?: TLSConfig;
}

export interface PollingConfig {
  updateInterval?: number;
  pollTimeout?: number;
  maxConsecutiveFailures?: number;
  pauseOnRepeatedFailures?: boolean;
}

export interface DisplayConfig {
  maxItems?: number;
  viewFilter?: 'all' | 'downloading' | 'completed' | 'paused';
  columns?: ColumnName[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  showProgressBar?: boolean;
  compact?: boolean;
  scale?: number;
  headerAlign?: 'left' | 'center' | 'right' | null;
}

export type ColumnName =
  | 'name'
  | 'size'
  | 'progress'
  | 'status'
  | 'seeds'
  | 'peers'
  | 'dlspeed'
  | 'upspeed'
  | 'eta'
  | 'ratio'
  | 'added_on'
  | 'actions';

export interface ModuleConfig {
  connection?: ConnectionConfig;
  polling?: PollingConfig;
  display?: DisplayConfig;
  host?: string;
  username?: string;
  password?: string;
  updateInterval?: number;
  maxItems?: number;
  viewFilter?: 'all' | 'downloading' | 'completed' | 'paused';
  compact?: boolean;
  scale?: number;
}

export interface NormalizedConfig {
  compact: boolean;
  scale: number;
  maxItems: number;
  viewFilter: string;
  columns: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  showProgressBar: boolean;
  headerAlign: 'left' | 'center' | 'right' | null;
}

export interface NormalizedHelperConfig {
  connection: {
    host: string;
    username: string;
    password: string;
    tls: TLSConfig;
  };
  polling: {
    updateInterval: number;
    pollTimeout: number;
    maxConsecutiveFailures: number;
    pauseOnRepeatedFailures: boolean;
  };
  display: {
    maxItems: number;
    viewFilter: string;
    compact: boolean;
    scale: number;
  };
}

export interface ColumnDefinition {
  label: string;
  field: string | null;
  align: 'left' | 'center' | 'right';
  sortable: boolean;
  sortFn?: (a: TorrentData, b: TorrentData) => number;
  formatter: (value: any, torrent?: TorrentData) => any;
  bold?: boolean;
  className?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | undefined;
    raw: Record<string, string | string[]>;
  };
  json: () => Promise<any>;
  text: () => Promise<string>;
}

export interface ErrorPayload {
  message: string;
  failures: number;
  willRetry?: boolean;
}

export interface ActionPayload {
  hash: string;
  action: 'start' | 'pause' | 'resume';
}

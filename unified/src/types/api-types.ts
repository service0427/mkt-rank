// API Request/Response Types

// Service Management
export interface CreateServiceRequest {
  service_code: string;
  service_url: string;
  service_name: string;
  db_type: 'supabase' | 'mysql' | 'postgresql';
  connection_config: Record<string, any>;
  field_mappings?: Record<string, any>;
  sync_config?: {
    interval_minutes?: number;
    batch_size?: number;
    direction?: 'import' | 'export' | 'bidirectional';
  };
}

export interface UpdateServiceRequest {
  service_name?: string;
  service_url?: string;
  connection_config?: Record<string, any>;
  field_mappings?: Record<string, any>;
  sync_config?: Record<string, any>;
  is_active?: boolean;
}

export interface TestConnectionRequest {
  db_type: 'supabase' | 'mysql' | 'postgresql';
  connection_config: Record<string, any>;
}

// Keyword Management
export interface CreateKeywordRequest {
  keyword: string;
  service_id: string;
  type?: string;
  pc_count?: number;
  mobile_count?: number;
  total_count?: number;
  metadata?: Record<string, any>;
}

export interface UpdateKeywordRequest {
  keyword?: string;
  is_active?: boolean;
  type?: string;
  metadata?: Record<string, any>;
}

export interface KeywordFilterParams {
  service_id?: string;
  type?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ImportKeywordsRequest {
  service_id: string;
  keywords: Array<{
    keyword: string;
    type?: string;
    metadata?: Record<string, any>;
  }>;
  mode?: 'append' | 'replace';
}

// Sync Management
export interface TriggerSyncRequest {
  sync_type?: 'full' | 'incremental';
  sync_direction?: 'import' | 'export' | 'bidirectional';
}

export interface UpdateSyncConfigRequest {
  interval_minutes?: number;
  batch_size?: number;
  direction?: 'import' | 'export' | 'bidirectional';
}

export interface SyncLogFilterParams {
  service_id?: string;
  status?: string;
  sync_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

// Rankings
export interface RankingFilterParams {
  service_id?: string;
  keyword?: string;
  platform?: 'naver_shopping' | 'coupang';
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface RankingCompareParams {
  keywords: string[];
  services?: string[];
  platform: 'naver_shopping' | 'coupang';
  period?: 'hour' | 'day' | 'week' | 'month';
}

// Statistics
export interface StatsTimeRange {
  start: string;
  end: string;
  interval?: 'hour' | 'day' | 'week' | 'month';
}

export interface ServiceStatsParams {
  service_id?: string;
  time_range?: StatsTimeRange;
  metrics?: string[];
}

// WebSocket Events
export interface WebSocketMessage {
  type: 'sync_progress' | 'ranking_update' | 'service_status' | 'error';
  service_id?: string;
  data: any;
  timestamp: Date;
}

export interface SyncProgressData {
  sync_id: string;
  progress: number;
  current_records: number;
  total_records: number;
  status: string;
  message?: string;
}

// Error Responses
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  validation_errors?: ValidationError[];
  timestamp: Date;
}
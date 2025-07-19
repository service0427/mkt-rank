// Unified System Core Types

export interface UnifiedService {
  service_id: string;
  service_code: string;
  service_url: string;
  service_name: string;
  db_type: 'supabase' | 'mysql' | 'postgresql';
  connection_config: Record<string, any>;
  sync_config: SyncConfig;
  field_mappings: FieldMappings;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SyncConfig {
  interval_minutes: number;
  batch_size: number;
  direction: 'import' | 'export' | 'bidirectional';
  last_sync?: Date;
}

export interface FieldMappings {
  [targetField: string]: string | FieldMappingRule;
}

export interface FieldMappingRule {
  source?: string;
  constant?: any;
  transform?: string;
}

export interface UnifiedKeyword {
  id: string;
  keyword: string;
  service_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, any>;
  
  // 검색량 데이터
  pc_count?: number;
  mobile_count?: number;
  total_count?: number;
  pc_ratio?: number;
  mobile_ratio?: number;
  searched_at?: Date;
  
  // 분류
  type?: string;
  user_id?: string;
}

export interface UnifiedRanking {
  id: string;
  service_id: string;
  keyword_id: string;
  keyword: string;
  rank?: number;
  previous_rank?: number;
  rank_change?: number;
  platform: 'naver_shopping' | 'coupang';
  collected_at: Date;
  metadata?: Record<string, any>;
}

export interface SyncLog {
  sync_id: string;
  service_id: string;
  sync_type: 'full' | 'incremental' | 'manual';
  sync_direction: 'import' | 'export' | 'bidirectional';
  started_at: Date;
  completed_at?: Date;
  status: 'running' | 'success' | 'failed' | 'partial';
  total_records: number;
  success_records: number;
  failed_records: number;
  error_details?: any;
  created_at: Date;
}

export interface SyncResult {
  success: boolean;
  totalRecords: number;
  successRecords: number;
  failedRecords: number;
  errors: SyncError[];
  duration: number;
}

export interface SyncError {
  record: any;
  error: string;
  timestamp: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Service Adapter Interface
export interface ServiceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  validateConnection(): Promise<boolean>;
  fetchKeywords(options?: FetchOptions): Promise<UnifiedKeyword[]>;
  syncKeywords(keywords: UnifiedKeyword[]): Promise<SyncResult>;
  getFieldMappings(): FieldMappings;
  getServiceInfo(): UnifiedService;
}

export interface FetchOptions {
  limit?: number;
  offset?: number;
  filter?: Record<string, any>;
  since?: Date;
}

// Database Connection Types
export interface DatabaseConfig {
  supabase?: {
    url: string;
    key: string;
  };
  mysql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

// Web UI Types
export interface DashboardStats {
  totalServices: number;
  activeServices: number;
  totalKeywords: number;
  recentSyncs: SyncLog[];
  rankingStats: {
    totalRankings: number;
    lastCollected: Date;
    avgRank: number;
  };
}

export interface ServiceFormData {
  service_code: string;
  service_url: string;
  service_name: string;
  db_type: 'supabase' | 'mysql' | 'postgresql';
  connection_config: Record<string, any>;
}

// Search Types (기존 시스템과의 호환성)
export interface SearchResult {
  keyword: string;
  rank: number;
  title: string;
  link: string;
  image?: string;
  lprice?: string;
  hprice?: string;
  mallName?: string;
  productId?: string;
  productType?: string;
  brand?: string;
  maker?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
}

// Export all types
export * from './service-adapter';
export * from './api-types';
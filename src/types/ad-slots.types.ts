// MySQL ad_slots 테이블 구조
export interface AdSlot {
  ad_slot_id: number;
  user_id: number;
  managed_id?: number;
  work_keyword?: string;
  product_url?: string;
  price_compare_mid?: string;
  product_mid?: string;
  seller_mid?: string;
  main_keyword?: string;
  product_name?: string;
  price_compare_url?: string;
  price_rank?: number;
  price_start_rank?: number;
  price_rank_diff?: number;
  store_rank?: number;
  store_start_rank?: number;
  store_rank_diff?: number;
  rank_check_date?: Date;
  status: 'EMPTY' | 'WAITING' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'MODIFIED';
  start_date?: Date;
  end_date?: Date;
  duration_days?: number;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

// 로컬 PostgreSQL ad_slot_rankings 테이블 구조
export interface AdSlotRanking {
  id?: number;
  ad_slot_id: number;
  work_keyword: string;
  price_compare_mid?: string;
  product_mid?: string;
  seller_mid?: string;
  collected_at: Date;
  price_rank?: number;
  store_rank?: number;
  is_found: boolean;
  found_at_page?: number;
  total_results?: number;
  raw_data?: Record<string, unknown>;
  created_at?: Date;
}

// 시간별 요약 데이터
export interface AdSlotHourlySummary {
  ad_slot_id: number;
  work_keyword: string;
  hour: Date;
  avg_price_rank?: number;
  min_price_rank?: number;
  max_price_rank?: number;
  avg_store_rank?: number;
  min_store_rank?: number;
  max_store_rank?: number;
  sample_count: number;
}

// 순위 업데이트 결과
export interface RankingUpdateResult {
  ad_slot_id: number;
  work_keyword: string;
  price_rank?: number;
  store_rank?: number;
  price_rank_diff?: number;
  store_rank_diff?: number;
  is_found: boolean;
  found_at_page?: number;
  error?: string;
}

// Queue Job 데이터
export interface AdSlotJobData {
  adSlot: AdSlot;
  priority?: number;
  retryCount?: number;
}

// API 응답 타입
export interface AdSlotCollectResponse {
  success: boolean;
  message: string;
  data?: {
    totalSlots: number;
    queuedSlots: number;
    estimatedTime: number;
  };
  error?: string;
}

export interface AdSlotStatusResponse {
  success: boolean;
  data?: {
    totalActive: number;
    processing: number;
    completed: number;
    failed: number;
    queueStatus: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
  error?: string;
}

// MySQL 쿼리 결과 타입
export interface AdSlotQueryResult {
  affectedRows: number;
  insertId?: number;
  changedRows?: number;
}
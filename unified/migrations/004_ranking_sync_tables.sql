-- 순위 동기화 관련 테이블

-- 1. 순위 동기화 로그 테이블
CREATE TABLE IF NOT EXISTS unified_ranking_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id),
  sync_type VARCHAR(50), -- 'current', 'hourly', 'daily'
  platform VARCHAR(50), -- 'naver_shopping', 'coupang'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running', 'success', 'failed', 'partial'
  total_records INTEGER DEFAULT 0,
  success_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 추가
CREATE INDEX idx_ranking_sync_logs_service ON unified_ranking_sync_logs(service_id);
CREATE INDEX idx_ranking_sync_logs_status ON unified_ranking_sync_logs(status);
CREATE INDEX idx_ranking_sync_logs_created ON unified_ranking_sync_logs(created_at DESC);

-- 2. MySQL AD_SLOTS 테이블 수정 (이 쿼리는 MySQL에서 실행해야 함)
/*
-- MySQL에서 실행할 쿼리
ALTER TABLE ad_slots 
ADD COLUMN IF NOT EXISTS current_rank INT,
ADD COLUMN IF NOT EXISTS previous_rank INT,
ADD COLUMN IF NOT EXISTS rank_updated_at DATETIME;

-- 인덱스 추가
CREATE INDEX idx_ad_slots_rank_updated ON ad_slots(rank_updated_at);
*/

-- 3. 서비스별 동기화 설정 업데이트 (예시)
UPDATE unified_services 
SET sync_config = jsonb_set(
  COALESCE(sync_config, '{}'::jsonb),
  '{sync_rankings}',
  'true'::jsonb
)
WHERE service_code IN ('mkt-guide-supabase', 'top-mysql');

-- Supabase 서비스 설정
UPDATE unified_services 
SET sync_config = sync_config || '{
  "sync_rankings": true,
  "ranking_sync_interval": 5,
  "sync_current": true,
  "sync_hourly": true,
  "sync_daily": true,
  "ranking_platforms": ["naver_shopping"]
}'::jsonb
WHERE service_code = 'mkt-guide-supabase';

-- MySQL 서비스 설정
UPDATE unified_services 
SET sync_config = sync_config || '{
  "sync_rankings": true,
  "ranking_sync_interval": 5,
  "sync_current": true,
  "sync_hourly": false,
  "sync_daily": false,
  "ranking_platforms": ["naver_shopping"],
  "mid_mapping": {
    "use_mid": true,
    "mid_fields": ["price_compare_mid", "product_mid", "seller_mid"]
  }
}'::jsonb
WHERE service_code = 'top-mysql';
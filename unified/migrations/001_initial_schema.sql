-- Unified Keyword Management System
-- Initial Database Schema
-- Created: 2025-07-19

-- 1. 서비스 관리 테이블
CREATE TABLE IF NOT EXISTS unified_services (
  service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code VARCHAR(50) UNIQUE NOT NULL,
  service_url VARCHAR(255) NOT NULL,
  service_name VARCHAR(100) NOT NULL,
  db_type VARCHAR(50) NOT NULL CHECK (db_type IN ('supabase', 'mysql', 'postgresql')),
  connection_config JSONB NOT NULL, -- 암호화된 연결 정보
  sync_config JSONB DEFAULT '{"interval_minutes": 1, "batch_size": 1000, "direction": "bidirectional"}',
  field_mappings JSONB DEFAULT '{}', -- 필드 매핑 규칙
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 통합 키워드 마스터 테이블
CREATE TABLE IF NOT EXISTS unified_search_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(200) NOT NULL,
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  
  -- 공통 필드
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- 확장 필드 (서비스별 커스텀 데이터)
  metadata JSONB DEFAULT '{}',
  
  -- 검색량 데이터 (옵셔널)
  pc_count INTEGER DEFAULT 0,
  mobile_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  pc_ratio NUMERIC(5,2) DEFAULT 0,
  mobile_ratio NUMERIC(5,2) DEFAULT 0,
  searched_at TIMESTAMP WITH TIME ZONE,
  
  -- 분류
  type VARCHAR(50) DEFAULT 'shopping',
  user_id UUID NULL,
  
  CONSTRAINT unified_keywords_unique UNIQUE (keyword, service_id, type)
);

-- 3. 동기화 이력 관리
CREATE TABLE IF NOT EXISTS unified_sync_logs (
  sync_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('full', 'incremental', 'manual')),
  sync_direction VARCHAR(20) NOT NULL CHECK (sync_direction IN ('import', 'export', 'bidirectional')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  total_records INTEGER DEFAULT 0,
  success_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 현재 순위 데이터
CREATE TABLE IF NOT EXISTS unified_current_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  keyword VARCHAR(200) NOT NULL,
  rank INTEGER,
  previous_rank INTEGER,
  rank_change INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN previous_rank IS NULL OR rank IS NULL THEN NULL
      ELSE previous_rank - rank
    END
  ) STORED,
  platform VARCHAR(50) NOT NULL, -- 'naver_shopping', 'coupang'
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  -- 인덱스를 위한 복합 유니크 제약
  CONSTRAINT unified_rankings_unique UNIQUE (keyword_id, platform)
);

-- 5. 시간별 순위 이력
CREATE TABLE IF NOT EXISTS unified_hourly_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  keyword VARCHAR(200) NOT NULL,
  hour TIMESTAMP WITH TIME ZONE NOT NULL,
  platform VARCHAR(50) NOT NULL,
  avg_rank NUMERIC(10,2),
  min_rank INTEGER,
  max_rank INTEGER,
  sample_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unified_hourly_unique UNIQUE (keyword_id, platform, hour)
);

-- 6. 일별 순위 이력
CREATE TABLE IF NOT EXISTS unified_daily_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  keyword VARCHAR(200) NOT NULL,
  date DATE NOT NULL,
  platform VARCHAR(50) NOT NULL,
  avg_rank NUMERIC(10,2),
  min_rank INTEGER,
  max_rank INTEGER,
  sample_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unified_daily_unique UNIQUE (keyword_id, platform, date)
);

-- 인덱스 생성
CREATE INDEX idx_unified_services_active ON unified_services(is_active);
CREATE INDEX idx_unified_keywords_keyword ON unified_search_keywords(keyword);
CREATE INDEX idx_unified_keywords_service ON unified_search_keywords(service_id);
CREATE INDEX idx_unified_keywords_type ON unified_search_keywords(type);
CREATE INDEX idx_unified_keywords_active ON unified_search_keywords(is_active);
CREATE INDEX idx_unified_keywords_composite ON unified_search_keywords(keyword, service_id, type);

CREATE INDEX idx_unified_sync_logs_service ON unified_sync_logs(service_id);
CREATE INDEX idx_unified_sync_logs_status ON unified_sync_logs(status);
CREATE INDEX idx_unified_sync_logs_created ON unified_sync_logs(created_at DESC);

CREATE INDEX idx_unified_current_rankings_keyword ON unified_current_rankings(keyword_id);
CREATE INDEX idx_unified_current_rankings_platform ON unified_current_rankings(platform);
CREATE INDEX idx_unified_current_rankings_collected ON unified_current_rankings(collected_at DESC);

CREATE INDEX idx_unified_hourly_rankings_keyword ON unified_hourly_rankings(keyword_id);
CREATE INDEX idx_unified_hourly_rankings_hour ON unified_hourly_rankings(hour DESC);

CREATE INDEX idx_unified_daily_rankings_keyword ON unified_daily_rankings(keyword_id);
CREATE INDEX idx_unified_daily_rankings_date ON unified_daily_rankings(date DESC);

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- updated_at 트리거 생성
CREATE TRIGGER update_unified_services_updated_at BEFORE UPDATE
    ON unified_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unified_keywords_updated_at BEFORE UPDATE
    ON unified_search_keywords FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 초기 서비스 데이터 삽입
INSERT INTO unified_services (service_code, service_url, service_name, db_type, connection_config, field_mappings)
VALUES 
(
  'mkt-guide',
  'https://mkt-guide.com/',
  'MKT Guide Service',
  'supabase',
  '{"url": "SUPABASE_URL_HERE", "key": "SUPABASE_KEY_HERE"}',
  '{
    "keyword": "keyword",
    "pc_count": "pc_count",
    "mobile_count": "mobile_count",
    "total_count": "total_count",
    "pc_ratio": "pc_ratio",
    "mobile_ratio": "mobile_ratio",
    "type": "type",
    "user_id": "user_id",
    "is_active": "is_active",
    "searched_at": "searched_at"
  }'
),
(
  'top-re-kr',
  'https://top.re.kr/',
  'Top Re KR Service',
  'mysql',
  '{"host": "138.2.125.63", "port": 3306, "database": "magic_db", "user": "MYSQL_USER_HERE", "password": "MYSQL_PASSWORD_HERE"}',
  '{
    "keyword": "work_keyword",
    "type": "_constant:ad_slots",
    "is_active": "_constant:true"
  }'
) ON CONFLICT (service_code) DO NOTHING;
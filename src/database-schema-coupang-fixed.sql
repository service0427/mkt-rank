-- =====================================================
-- 쿠팡(CP) 순위 데이터 테이블 스키마 (로컬 PostgreSQL용)
-- search_keywords 참조 제거됨
-- =====================================================

-- 쿠팡 순위 메인 테이블 (파티션 베이스)
CREATE TABLE IF NOT EXISTS cp_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  image TEXT,
  lprice INTEGER NOT NULL,
  mall_name VARCHAR(255),
  brand VARCHAR(255),
  category1 VARCHAR(255),
  category2 VARCHAR(255),
  -- 쿠팡 특화 필드
  seller_name VARCHAR(255),
  delivery_type VARCHAR(50), -- '로켓배송', '무료배송' 등
  is_rocket BOOLEAN DEFAULT false,
  is_rocket_fresh BOOLEAN DEFAULT false,
  is_rocket_global BOOLEAN DEFAULT false,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  is_wow_deal BOOLEAN DEFAULT false,
  discount_rate INTEGER, -- 할인율
  original_price INTEGER, -- 원가
  card_discount TEXT, -- 카드 할인 정보
  -- 메타 정보
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 성능 최적화를 위한 인덱스
CREATE INDEX idx_cp_rankings_keyword_collected 
  ON cp_rankings(keyword_id, collected_at DESC);
CREATE INDEX idx_cp_rankings_product 
  ON cp_rankings(product_id);
CREATE INDEX idx_cp_rankings_collected_at 
  ON cp_rankings(collected_at DESC);
CREATE INDEX idx_cp_rankings_rocket 
  ON cp_rankings(is_rocket) WHERE is_rocket = true;

-- 파티셔닝을 위한 준비 (월별 파티션)
CREATE TABLE IF NOT EXISTS cp_rankings_partitioned (
  LIKE cp_rankings INCLUDING ALL
) PARTITION BY RANGE (collected_at);

-- 월별 파티션 생성 (2025년 7월~12월)
CREATE TABLE cp_rankings_2025_07 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE cp_rankings_2025_08 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE cp_rankings_2025_09 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE cp_rankings_2025_10 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE cp_rankings_2025_11 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE cp_rankings_2025_12 PARTITION OF cp_rankings_partitioned
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 시간별 집계 테이블 (성능 최적화)
CREATE TABLE IF NOT EXISTS cp_rankings_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  hour TIMESTAMP WITH TIME ZONE NOT NULL, -- 시간별로 정규화
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  is_rocket BOOLEAN DEFAULT false,
  avg_rating NUMERIC(3,2),
  appearance_count INTEGER DEFAULT 1,
  UNIQUE(keyword_id, product_id, hour)
);

-- 일별 집계 테이블
CREATE TABLE IF NOT EXISTS cp_rankings_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  is_rocket BOOLEAN DEFAULT false,
  avg_rating NUMERIC(3,2),
  appearance_count INTEGER DEFAULT 1,
  UNIQUE(keyword_id, product_id, date)
);

-- 인덱스
CREATE INDEX idx_cp_rankings_hourly_keyword_time 
  ON cp_rankings_hourly(keyword_id, hour DESC);
CREATE INDEX idx_cp_rankings_daily_keyword_date 
  ON cp_rankings_daily(keyword_id, date DESC);

-- 데이터 정리를 위한 함수
CREATE OR REPLACE FUNCTION cleanup_old_cp_rankings() RETURNS void AS $$
BEGIN
  -- 30일 이상 된 원본 데이터 삭제
  DELETE FROM cp_rankings 
  WHERE collected_at < NOW() - INTERVAL '30 days';
  
  -- 90일 이상 된 시간별 집계 데이터 삭제
  DELETE FROM cp_rankings_hourly 
  WHERE hour < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 시간별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_hourly_cp_rankings() RETURNS void AS $$
BEGIN
  INSERT INTO cp_rankings_hourly (
    keyword_id, product_id, hour, avg_rank, min_rank, max_rank, 
    avg_price, min_price, max_price, is_rocket, avg_rating, appearance_count
  )
  SELECT 
    keyword_id,
    product_id,
    date_trunc('hour', collected_at) as hour,
    AVG(rank)::NUMERIC(5,2) as avg_rank,
    MIN(rank) as min_rank,
    MAX(rank) as max_rank,
    AVG(lprice)::INTEGER as avg_price,
    MIN(lprice) as min_price,
    MAX(lprice) as max_price,
    MAX(is_rocket::int)::boolean as is_rocket,
    AVG(rating)::NUMERIC(3,2) as avg_rating,
    COUNT(*) as appearance_count
  FROM cp_rankings
  WHERE collected_at >= date_trunc('hour', NOW() - INTERVAL '1 hour')
    AND collected_at < date_trunc('hour', NOW())
  GROUP BY keyword_id, product_id, date_trunc('hour', collected_at)
  ON CONFLICT (keyword_id, product_id, hour) 
  DO UPDATE SET
    avg_rank = EXCLUDED.avg_rank,
    min_rank = EXCLUDED.min_rank,
    max_rank = EXCLUDED.max_rank,
    avg_price = EXCLUDED.avg_price,
    min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price,
    is_rocket = EXCLUDED.is_rocket,
    avg_rating = EXCLUDED.avg_rating,
    appearance_count = EXCLUDED.appearance_count;
END;
$$ LANGUAGE plpgsql;
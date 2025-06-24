-- 쇼핑 순위 데이터 테이블
CREATE TABLE IF NOT EXISTS shopping_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  image TEXT,
  lprice INTEGER, -- 최저가
  hprice INTEGER, -- 최고가 (보통 비어있음)
  mall_name TEXT,
  product_type TEXT, -- 1: 네이버쇼핑, 2: 스마트스토어 등
  brand TEXT,
  maker TEXT,
  category1 TEXT,
  category2 TEXT,
  category3 TEXT,
  category4 TEXT,
  rank INTEGER NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 성능 최적화를 위한 인덱스
CREATE INDEX idx_shopping_rankings_keyword_collected 
  ON shopping_rankings(keyword_id, collected_at DESC);
CREATE INDEX idx_shopping_rankings_product 
  ON shopping_rankings(product_id);
CREATE INDEX idx_shopping_rankings_collected_at 
  ON shopping_rankings(collected_at DESC);

-- 파티셔닝을 위한 준비 (월별 파티션)
-- PostgreSQL 11+ 에서 지원
CREATE TABLE IF NOT EXISTS shopping_rankings_partitioned (
  LIKE shopping_rankings INCLUDING ALL
) PARTITION BY RANGE (collected_at);

-- 월별 파티션 생성 예시
CREATE TABLE shopping_rankings_2025_06 PARTITION OF shopping_rankings_partitioned
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- 시간별 집계 테이블 (성능 최적화)
CREATE TABLE IF NOT EXISTS shopping_rankings_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  hour TIMESTAMP WITH TIME ZONE NOT NULL, -- 시간별로 정규화
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  price_changes INTEGER DEFAULT 0,
  appearance_count INTEGER DEFAULT 1,
  UNIQUE(keyword_id, product_id, hour)
);

-- 일별 집계 테이블
CREATE TABLE IF NOT EXISTS shopping_rankings_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  date DATE NOT NULL,
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  avg_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  appearance_count INTEGER DEFAULT 1,
  UNIQUE(keyword_id, product_id, date)
);

-- 데이터 정리를 위한 함수
CREATE OR REPLACE FUNCTION cleanup_old_rankings() RETURNS void AS $$
BEGIN
  -- 30일 이상 된 원본 데이터 삭제
  DELETE FROM shopping_rankings 
  WHERE collected_at < NOW() - INTERVAL '30 days';
  
  -- 90일 이상 된 시간별 집계 데이터 삭제
  DELETE FROM shopping_rankings_hourly 
  WHERE hour < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 시간별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_hourly_rankings() RETURNS void AS $$
BEGIN
  INSERT INTO shopping_rankings_hourly (keyword_id, product_id, hour, avg_rank, min_rank, max_rank, appearance_count)
  SELECT 
    keyword_id,
    product_id,
    date_trunc('hour', collected_at) as hour,
    AVG(rank)::NUMERIC(5,2) as avg_rank,
    MIN(rank) as min_rank,
    MAX(rank) as max_rank,
    COUNT(*) as appearance_count
  FROM shopping_rankings
  WHERE collected_at >= date_trunc('hour', NOW() - INTERVAL '1 hour')
    AND collected_at < date_trunc('hour', NOW())
  GROUP BY keyword_id, product_id, date_trunc('hour', collected_at)
  ON CONFLICT (keyword_id, product_id, hour) 
  DO UPDATE SET
    avg_rank = EXCLUDED.avg_rank,
    min_rank = EXCLUDED.min_rank,
    max_rank = EXCLUDED.max_rank,
    appearance_count = EXCLUDED.appearance_count;
END;
$$ LANGUAGE plpgsql;
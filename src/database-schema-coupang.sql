-- =====================================================
-- 쿠팡(CP) 순위 데이터 테이블 스키마
-- =====================================================

-- 쿠팡 순위 현재 데이터 (최신 순위만 유지)
CREATE TABLE IF NOT EXISTS cp_rankings_current (
  keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  rank INTEGER NOT NULL,
  prev_rank INTEGER,
  title TEXT NOT NULL,
  lprice INTEGER NOT NULL,
  image TEXT,
  mall_name VARCHAR(255),
  brand VARCHAR(255),
  category1 VARCHAR(255),
  category2 VARCHAR(255),
  link TEXT,
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cp_rankings_current_pkey PRIMARY KEY (keyword_id, product_id),
  CONSTRAINT cp_rankings_current_keyword_id_fkey FOREIGN KEY (keyword_id) 
    REFERENCES search_keywords(id) ON DELETE CASCADE
);

-- 쿠팡 시간별 스냅샷 (매시간 저장)
CREATE TABLE IF NOT EXISTS cp_rankings_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  lprice INTEGER NOT NULL,
  image TEXT,
  mall_name VARCHAR(255),
  brand VARCHAR(255),
  category1 VARCHAR(255),
  category2 VARCHAR(255),
  link TEXT,
  -- 쿠팡 특화 필드
  seller_name VARCHAR(255),
  delivery_type VARCHAR(50),
  is_rocket BOOLEAN DEFAULT false,
  is_rocket_fresh BOOLEAN DEFAULT false,
  is_rocket_global BOOLEAN DEFAULT false,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  is_wow_deal BOOLEAN DEFAULT false,
  discount_rate INTEGER,
  original_price INTEGER,
  -- 스냅샷 정보
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cp_rankings_hourly_unique UNIQUE (keyword_id, product_id, snapshot_time)
);

-- 쿠팡 일별 스냅샷 (매일 23시 저장)
CREATE TABLE IF NOT EXISTS cp_rankings_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  lprice INTEGER NOT NULL,
  image TEXT,
  mall_name VARCHAR(255),
  brand VARCHAR(255),
  category1 VARCHAR(255),
  category2 VARCHAR(255),
  link TEXT,
  -- 쿠팡 특화 필드
  seller_name VARCHAR(255),
  delivery_type VARCHAR(50),
  is_rocket BOOLEAN DEFAULT false,
  is_rocket_fresh BOOLEAN DEFAULT false,
  is_rocket_global BOOLEAN DEFAULT false,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  is_wow_deal BOOLEAN DEFAULT false,
  discount_rate INTEGER,
  original_price INTEGER,
  -- 스냅샷 정보
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cp_rankings_daily_unique UNIQUE (keyword_id, product_id, snapshot_date)
);

-- 쿠팡 키워드 통계 (선택적)
CREATE TABLE IF NOT EXISTS cp_keyword_stats (
  keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_products INTEGER DEFAULT 0,
  avg_price NUMERIC(10,2),
  min_price INTEGER,
  max_price INTEGER,
  rocket_products_count INTEGER DEFAULT 0,
  wow_deal_count INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cp_keyword_stats_pkey PRIMARY KEY (keyword_id, date)
);

-- =====================================================
-- 인덱스 생성
-- =====================================================

-- cp_rankings_current 인덱스
CREATE INDEX idx_cp_rankings_current_keyword_rank 
  ON cp_rankings_current(keyword_id, rank);
CREATE INDEX idx_cp_rankings_current_product 
  ON cp_rankings_current(product_id);
CREATE INDEX idx_cp_rankings_current_collected 
  ON cp_rankings_current(collected_at DESC);
CREATE INDEX idx_cp_rankings_current_rocket 
  ON cp_rankings_current(is_rocket) WHERE is_rocket = true;

-- cp_rankings_hourly 인덱스
CREATE INDEX idx_cp_rankings_hourly_keyword_time 
  ON cp_rankings_hourly(keyword_id, snapshot_time DESC);
CREATE INDEX idx_cp_rankings_hourly_snapshot 
  ON cp_rankings_hourly(snapshot_time DESC);

-- cp_rankings_daily 인덱스
CREATE INDEX idx_cp_rankings_daily_keyword_date 
  ON cp_rankings_daily(keyword_id, snapshot_date DESC);
CREATE INDEX idx_cp_rankings_daily_snapshot 
  ON cp_rankings_daily(snapshot_date DESC);

-- cp_keyword_stats 인덱스
CREATE INDEX idx_cp_keyword_stats_date 
  ON cp_keyword_stats(date DESC);

-- =====================================================
-- 뷰 생성 (선택적)
-- =====================================================

-- 현재 로켓배송 상품만 보는 뷰
CREATE OR REPLACE VIEW cp_rocket_products AS
SELECT * FROM cp_rankings_current 
WHERE is_rocket = true 
ORDER BY keyword_id, rank;

-- 키워드별 TOP 10 상품 뷰
CREATE OR REPLACE VIEW cp_top10_products AS
SELECT * FROM cp_rankings_current 
WHERE rank <= 10 
ORDER BY keyword_id, rank;

-- =====================================================
-- 함수 생성
-- =====================================================

-- 이전 순위 업데이트 함수
CREATE OR REPLACE FUNCTION update_cp_prev_rank() RETURNS TRIGGER AS $$
BEGIN
  -- 새로운 순위 데이터가 들어올 때 이전 순위 업데이트
  UPDATE cp_rankings_current
  SET prev_rank = OLD.rank
  WHERE keyword_id = NEW.keyword_id 
    AND product_id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 통계 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_cp_keyword_stats() RETURNS void AS $$
BEGIN
  INSERT INTO cp_keyword_stats (
    keyword_id, date, total_products, avg_price, min_price, max_price,
    rocket_products_count, wow_deal_count, avg_rating
  )
  SELECT 
    keyword_id,
    CURRENT_DATE as date,
    COUNT(DISTINCT product_id) as total_products,
    AVG(lprice)::NUMERIC(10,2) as avg_price,
    MIN(lprice) as min_price,
    MAX(lprice) as max_price,
    COUNT(CASE WHEN is_rocket THEN 1 END) as rocket_products_count,
    COUNT(CASE WHEN is_wow_deal THEN 1 END) as wow_deal_count,
    AVG(rating)::NUMERIC(3,2) as avg_rating
  FROM cp_rankings_current
  GROUP BY keyword_id
  ON CONFLICT (keyword_id, date) DO UPDATE SET
    total_products = EXCLUDED.total_products,
    avg_price = EXCLUDED.avg_price,
    min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price,
    rocket_products_count = EXCLUDED.rocket_products_count,
    wow_deal_count = EXCLUDED.wow_deal_count,
    avg_rating = EXCLUDED.avg_rating,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 권한 설정 (Supabase RLS)
-- =====================================================

-- RLS 활성화
ALTER TABLE cp_rankings_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_rankings_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_rankings_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_keyword_stats ENABLE ROW LEVEL SECURITY;

-- 읽기 권한 정책 (모든 사용자)
CREATE POLICY "cp_rankings_current read access" ON cp_rankings_current
  FOR SELECT USING (true);

CREATE POLICY "cp_rankings_hourly read access" ON cp_rankings_hourly
  FOR SELECT USING (true);

CREATE POLICY "cp_rankings_daily read access" ON cp_rankings_daily
  FOR SELECT USING (true);

CREATE POLICY "cp_keyword_stats read access" ON cp_keyword_stats
  FOR SELECT USING (true);

-- 쓰기 권한은 service role만 가능 (API를 통해서만)

-- =====================================================
-- 초기 데이터 정리 스케줄 (선택적)
-- =====================================================

-- 30일 이상 된 시간별 데이터 삭제
-- 90일 이상 된 일별 데이터 삭제
-- cron job이나 pg_cron으로 실행

/*
SELECT cron.schedule(
  'cleanup-cp-hourly-data',
  '0 3 * * *', -- 매일 새벽 3시
  $$DELETE FROM cp_rankings_hourly WHERE snapshot_time < NOW() - INTERVAL '30 days'$$
);

SELECT cron.schedule(
  'cleanup-cp-daily-data',
  '0 3 * * *', -- 매일 새벽 3시
  $$DELETE FROM cp_rankings_daily WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'$$
);
*/
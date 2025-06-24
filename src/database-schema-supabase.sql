-- Supabase Schema (대시보드용 요약 데이터)
-- 기존 search_keywords 테이블은 그대로 사용
-- 최신 랭킹과 집계 데이터만 저장

-- 최신 랭킹 스냅샷 (최근 24시간 데이터만 유지)
CREATE TABLE IF NOT EXISTS shopping_rankings_latest (
    keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    image TEXT,
    lprice INTEGER NOT NULL,
    mall_name VARCHAR(255),
    brand VARCHAR(255),
    category1 VARCHAR(255),
    category2 VARCHAR(255),
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id)
);

-- 시간별 요약 (최근 7일만 유지)
CREATE TABLE IF NOT EXISTS shopping_rankings_hourly_summary (
    keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL,
    hour TIMESTAMP WITH TIME ZONE NOT NULL,
    avg_rank DECIMAL(10, 2) NOT NULL,
    min_rank INTEGER NOT NULL,
    max_rank INTEGER NOT NULL,
    title TEXT,
    brand VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id, hour)
);

-- 일별 요약 (최근 30일만 유지)
CREATE TABLE IF NOT EXISTS shopping_rankings_daily_summary (
    keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    avg_rank DECIMAL(10, 2) NOT NULL,
    min_rank INTEGER NOT NULL,
    max_rank INTEGER NOT NULL,
    title TEXT,
    brand VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id, date)
);

-- 상위 10개 제품 추이 (빠른 대시보드 렌더링용)
CREATE TABLE IF NOT EXISTS top_products_trend (
    keyword_id UUID NOT NULL REFERENCES search_keywords(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    brand VARCHAR(255),
    current_rank INTEGER,
    prev_rank INTEGER,
    rank_change INTEGER, -- current_rank - prev_rank
    avg_rank_7d DECIMAL(10, 2),
    avg_rank_30d DECIMAL(10, 2),
    first_seen_at TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id)
);

-- 키워드별 통계
CREATE TABLE IF NOT EXISTS keyword_statistics (
    keyword_id UUID PRIMARY KEY REFERENCES search_keywords(id) ON DELETE CASCADE,
    total_products INTEGER DEFAULT 0,
    unique_products_24h INTEGER DEFAULT 0,
    unique_products_7d INTEGER DEFAULT 0,
    avg_price INTEGER,
    min_price INTEGER,
    max_price INTEGER,
    last_collected_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_shopping_rankings_latest_keyword 
    ON shopping_rankings_latest(keyword_id, rank);
CREATE INDEX idx_hourly_summary_keyword_hour 
    ON shopping_rankings_hourly_summary(keyword_id, hour DESC);
CREATE INDEX idx_daily_summary_keyword_date 
    ON shopping_rankings_daily_summary(keyword_id, date DESC);
CREATE INDEX idx_top_products_trend_keyword 
    ON top_products_trend(keyword_id, current_rank);

-- 오래된 데이터 자동 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_supabase_data()
RETURNS void AS $$
BEGIN
    -- 24시간 이상 된 최신 랭킹 삭제
    DELETE FROM shopping_rankings_latest 
    WHERE collected_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    
    -- 7일 이상 된 시간별 요약 삭제
    DELETE FROM shopping_rankings_hourly_summary 
    WHERE hour < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    -- 30일 이상 된 일별 요약 삭제
    DELETE FROM shopping_rankings_daily_summary 
    WHERE date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- RLS 정책 (필요한 경우)
ALTER TABLE shopping_rankings_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_rankings_hourly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_rankings_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_products_trend ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_statistics ENABLE ROW LEVEL SECURITY;

-- 읽기 전용 정책 (인증된 사용자)
CREATE POLICY "Enable read access for authenticated users" ON shopping_rankings_latest
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for authenticated users" ON shopping_rankings_hourly_summary
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for authenticated users" ON shopping_rankings_daily_summary
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for authenticated users" ON top_products_trend
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for authenticated users" ON keyword_statistics
    FOR SELECT USING (auth.role() = 'authenticated');
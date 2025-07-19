-- ad_slots 순위 추적을 위한 테이블 생성
-- 로컬 PostgreSQL (public 스키마)

-- 1. ad_slot_rankings: 실시간 순위 데이터
CREATE TABLE IF NOT EXISTS ad_slot_rankings (
    id BIGSERIAL PRIMARY KEY,
    ad_slot_id BIGINT NOT NULL,
    work_keyword VARCHAR(255) NOT NULL,
    price_compare_mid VARCHAR(100),
    product_mid VARCHAR(100),
    seller_mid VARCHAR(100),
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    price_rank INTEGER,
    store_rank INTEGER,
    is_found BOOLEAN DEFAULT false,
    found_at_page INTEGER,
    total_results INTEGER,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ad_slot_rankings_hourly: 시간별 요약
CREATE TABLE IF NOT EXISTS ad_slot_rankings_hourly (
    ad_slot_id BIGINT NOT NULL,
    work_keyword VARCHAR(255) NOT NULL,
    hour TIMESTAMP WITH TIME ZONE NOT NULL,
    avg_price_rank DECIMAL(10,2),
    min_price_rank INTEGER,
    max_price_rank INTEGER,
    avg_store_rank DECIMAL(10,2),
    min_store_rank INTEGER,
    max_store_rank INTEGER,
    sample_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ad_slot_id, hour)
);

-- 3. ad_slot_rankings_daily: 일별 요약
CREATE TABLE IF NOT EXISTS ad_slot_rankings_daily (
    ad_slot_id BIGINT NOT NULL,
    work_keyword VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    avg_price_rank DECIMAL(10,2),
    min_price_rank INTEGER,
    max_price_rank INTEGER,
    avg_store_rank DECIMAL(10,2),
    min_store_rank INTEGER,
    max_store_rank INTEGER,
    sample_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ad_slot_id, date)
);

-- 4. ad_slot_api_logs: API 사용 로그
CREATE TABLE IF NOT EXISTS ad_slot_api_logs (
    id BIGSERIAL PRIMARY KEY,
    ad_slot_id BIGINT,
    keyword VARCHAR(255),
    page_number INTEGER,
    response_time_ms INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ad_slot_rankings_slot_time 
    ON ad_slot_rankings(ad_slot_id, collected_at DESC);
    
CREATE INDEX IF NOT EXISTS idx_ad_slot_rankings_keyword 
    ON ad_slot_rankings(work_keyword);
    
CREATE INDEX IF NOT EXISTS idx_ad_slot_rankings_mid 
    ON ad_slot_rankings(price_compare_mid, seller_mid);
    
CREATE INDEX IF NOT EXISTS idx_ad_slot_rankings_collected 
    ON ad_slot_rankings(collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_slot_hourly_keyword 
    ON ad_slot_rankings_hourly(work_keyword, hour DESC);

CREATE INDEX IF NOT EXISTS idx_ad_slot_daily_keyword 
    ON ad_slot_rankings_daily(work_keyword, date DESC);

-- 통계 뷰 (선택사항)
CREATE OR REPLACE VIEW ad_slot_current_rankings AS
SELECT DISTINCT ON (ad_slot_id)
    ad_slot_id,
    work_keyword,
    price_compare_mid,
    seller_mid,
    price_rank,
    store_rank,
    is_found,
    collected_at
FROM ad_slot_rankings
ORDER BY ad_slot_id, collected_at DESC;

-- 일별 요약 자동 생성 함수 (선택사항)
CREATE OR REPLACE FUNCTION update_ad_slot_daily_summary()
RETURNS void AS $$
BEGIN
    INSERT INTO ad_slot_rankings_daily (
        ad_slot_id, work_keyword, date,
        avg_price_rank, min_price_rank, max_price_rank,
        avg_store_rank, min_store_rank, max_store_rank,
        sample_count
    )
    SELECT 
        ad_slot_id,
        work_keyword,
        DATE(collected_at) as date,
        AVG(price_rank)::DECIMAL(10,2),
        MIN(price_rank),
        MAX(price_rank),
        AVG(store_rank)::DECIMAL(10,2),
        MIN(store_rank),
        MAX(store_rank),
        COUNT(*)
    FROM ad_slot_rankings
    WHERE DATE(collected_at) = CURRENT_DATE - INTERVAL '1 day'
        AND is_found = true
    GROUP BY ad_slot_id, work_keyword, DATE(collected_at)
    ON CONFLICT (ad_slot_id, date) 
    DO UPDATE SET
        avg_price_rank = EXCLUDED.avg_price_rank,
        min_price_rank = EXCLUDED.min_price_rank,
        max_price_rank = EXCLUDED.max_price_rank,
        avg_store_rank = EXCLUDED.avg_store_rank,
        min_store_rank = EXCLUDED.min_store_rank,
        max_store_rank = EXCLUDED.max_store_rank,
        sample_count = EXCLUDED.sample_count;
END;
$$ LANGUAGE plpgsql;
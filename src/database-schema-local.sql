-- Local PostgreSQL Schema (전체 데이터 저장용)
-- 키워드는 Supabase의 search_keywords 테이블을 참조
-- 로컬 DB는 순수하게 대량 데이터 저장 용도

-- 쇼핑 랭킹 테이블 (파티셔닝 대상)
CREATE TABLE IF NOT EXISTS shopping_rankings (
    id UUID DEFAULT gen_random_uuid(),
    keyword_id UUID NOT NULL, -- Supabase search_keywords.id 참조
    keyword_name VARCHAR(255) NOT NULL, -- 캐싱용 (조인 없이 조회 가능)
    product_id VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    image TEXT,
    lprice INTEGER NOT NULL,
    hprice INTEGER,
    mall_name VARCHAR(255),
    product_type INTEGER,
    brand VARCHAR(255),
    maker VARCHAR(255),
    category1 VARCHAR(255),
    category2 VARCHAR(255),
    category3 VARCHAR(255),
    category4 VARCHAR(255),
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- 인덱스 생성
CREATE INDEX idx_shopping_rankings_keyword_collected 
    ON shopping_rankings(keyword_id, collected_at DESC);
CREATE INDEX idx_shopping_rankings_product_collected 
    ON shopping_rankings(product_id, collected_at DESC);
CREATE INDEX idx_shopping_rankings_keyword_product_collected 
    ON shopping_rankings(keyword_id, product_id, collected_at DESC);

-- 시간별 집계 테이블
CREATE TABLE IF NOT EXISTS shopping_rankings_hourly (
    keyword_id UUID NOT NULL,
    keyword_name VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    hour TIMESTAMP WITH TIME ZONE NOT NULL,
    avg_rank DECIMAL(10, 2) NOT NULL,
    min_rank INTEGER NOT NULL,
    max_rank INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    title TEXT,
    brand VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id, hour)
);

-- 일별 집계 테이블
CREATE TABLE IF NOT EXISTS shopping_rankings_daily (
    keyword_id UUID NOT NULL,
    keyword_name VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    avg_rank DECIMAL(10, 2) NOT NULL,
    min_rank INTEGER NOT NULL,
    max_rank INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    title TEXT,
    brand VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (keyword_id, product_id, date)
);

-- 백업 메타데이터 테이블
CREATE TABLE IF NOT EXISTS backup_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_month DATE NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    row_count BIGINT,
    backup_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    backup_completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Supabase 동기화 상태 테이블
CREATE TABLE IF NOT EXISTS supabase_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type VARCHAR(50) NOT NULL, -- 'hourly_aggregate', 'daily_aggregate', 'latest_rankings'
    last_synced_at TIMESTAMP WITH TIME ZONE,
    next_sync_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'idle',
    records_synced INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 월별 파티션 생성 함수
CREATE OR REPLACE FUNCTION create_monthly_partition(start_date DATE)
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_of_month DATE;
    end_of_month DATE;
BEGIN
    start_of_month := date_trunc('month', start_date);
    end_of_month := start_of_month + INTERVAL '1 month';
    partition_name := 'shopping_rankings_' || to_char(start_of_month, 'YYYY_MM');
    
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I PARTITION OF shopping_rankings
        FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_of_month,
        end_of_month
    );
    
    -- 파티션별 인덱스
    EXECUTE format('
        CREATE INDEX IF NOT EXISTS %I ON %I(keyword_id, collected_at DESC)',
        'idx_' || partition_name || '_keyword_collected',
        partition_name
    );
END;
$$ LANGUAGE plpgsql;

-- 현재 월부터 4개월치 파티션 생성
SELECT create_monthly_partition(CURRENT_DATE);
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '1 month');
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '2 months');
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '3 months');

-- 시간별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_hourly_rankings()
RETURNS void AS $$
BEGIN
    INSERT INTO shopping_rankings_hourly (
        keyword_id, keyword_name, product_id, hour, avg_rank, 
        min_rank, max_rank, sample_count, title, brand
    )
    SELECT 
        keyword_id,
        MAX(keyword_name) as keyword_name,
        product_id,
        date_trunc('hour', collected_at) as hour,
        AVG(rank)::DECIMAL(10, 2) as avg_rank,
        MIN(rank) as min_rank,
        MAX(rank) as max_rank,
        COUNT(*) as sample_count,
        MAX(title) as title,
        MAX(brand) as brand
    FROM shopping_rankings
    WHERE collected_at >= date_trunc('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour')
        AND collected_at < date_trunc('hour', CURRENT_TIMESTAMP)
    GROUP BY keyword_id, product_id, date_trunc('hour', collected_at)
    ON CONFLICT (keyword_id, product_id, hour) 
    DO UPDATE SET
        avg_rank = EXCLUDED.avg_rank,
        min_rank = EXCLUDED.min_rank,
        max_rank = EXCLUDED.max_rank,
        sample_count = EXCLUDED.sample_count,
        title = EXCLUDED.title,
        brand = EXCLUDED.brand;
END;
$$ LANGUAGE plpgsql;

-- 일별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_daily_rankings()
RETURNS void AS $$
BEGIN
    INSERT INTO shopping_rankings_daily (
        keyword_id, keyword_name, product_id, date, avg_rank, 
        min_rank, max_rank, sample_count, title, brand
    )
    SELECT 
        keyword_id,
        MAX(keyword_name) as keyword_name,
        product_id,
        hour::DATE as date,
        AVG(avg_rank)::DECIMAL(10, 2) as avg_rank,
        MIN(min_rank) as min_rank,
        MAX(max_rank) as max_rank,
        SUM(sample_count) as sample_count,
        MAX(title) as title,
        MAX(brand) as brand
    FROM shopping_rankings_hourly
    WHERE hour >= CURRENT_DATE - INTERVAL '1 day'
        AND hour < CURRENT_DATE
    GROUP BY keyword_id, product_id, hour::DATE
    ON CONFLICT (keyword_id, product_id, date) 
    DO UPDATE SET
        avg_rank = EXCLUDED.avg_rank,
        min_rank = EXCLUDED.min_rank,
        max_rank = EXCLUDED.max_rank,
        sample_count = EXCLUDED.sample_count,
        title = EXCLUDED.title,
        brand = EXCLUDED.brand;
END;
$$ LANGUAGE plpgsql;

-- 오래된 파티션 백업 및 삭제 함수
CREATE OR REPLACE FUNCTION backup_and_drop_old_partition()
RETURNS void AS $$
DECLARE
    oldest_month DATE;
    partition_name TEXT;
    backup_path TEXT;
    row_count BIGINT;
BEGIN
    -- 4개월 전 데이터 찾기
    oldest_month := date_trunc('month', CURRENT_DATE - INTERVAL '4 months');
    partition_name := 'shopping_rankings_' || to_char(oldest_month, 'YYYY_MM');
    backup_path := '/backup/shopping_rankings/' || to_char(oldest_month, 'YYYY_MM') || '.sql.gz';
    
    -- 파티션이 존재하는지 확인
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = partition_name
    ) THEN
        -- 행 수 계산
        EXECUTE format('SELECT COUNT(*) FROM %I', partition_name) INTO row_count;
        
        -- 백업 메타데이터 기록
        INSERT INTO backup_metadata (backup_month, file_path, row_count, backup_started_at, status)
        VALUES (oldest_month, backup_path, row_count, CURRENT_TIMESTAMP, 'pending');
        
        -- 실제 백업은 외부 스크립트로 처리 (pg_dump)
        -- 백업 완료 후 파티션 삭제
        -- EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
    END IF;
    
    -- 새로운 파티션 생성 (4개월 후)
    PERFORM create_monthly_partition(CURRENT_DATE + INTERVAL '4 months');
END;
$$ LANGUAGE plpgsql;

-- 통계 뷰: 데이터 현황
CREATE OR REPLACE VIEW data_statistics AS
SELECT 
    'total_rankings' as metric,
    COUNT(*) as value
FROM shopping_rankings
UNION ALL
SELECT 
    'unique_keywords' as metric,
    COUNT(DISTINCT keyword_id) as value
FROM shopping_rankings
UNION ALL
SELECT 
    'unique_products' as metric,
    COUNT(DISTINCT product_id) as value
FROM shopping_rankings
UNION ALL
SELECT 
    'oldest_data' as metric,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(collected_at)))/86400 as value
FROM shopping_rankings
UNION ALL
SELECT 
    'newest_data' as metric,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(collected_at)))/60 as value
FROM shopping_rankings;
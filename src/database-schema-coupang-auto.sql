-- =====================================================
-- 쿠팡(CP) 순위 데이터 테이블 - 자동 파티션 관리
-- =====================================================

-- 메인 파티션 테이블 (베이스)
CREATE TABLE IF NOT EXISTS cp_rankings (
  id UUID DEFAULT gen_random_uuid(),
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
  card_discount TEXT,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (collected_at);

-- 인덱스
CREATE INDEX idx_cp_rankings_keyword_collected 
  ON cp_rankings(keyword_id, collected_at DESC);
CREATE INDEX idx_cp_rankings_product 
  ON cp_rankings(product_id);
CREATE INDEX idx_cp_rankings_collected_at 
  ON cp_rankings(collected_at DESC);
CREATE INDEX idx_cp_rankings_rocket 
  ON cp_rankings(is_rocket) WHERE is_rocket = true;

-- 월별 파티션 자동 생성 함수
CREATE OR REPLACE FUNCTION create_cp_monthly_partition(start_date DATE)
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_of_month DATE;
    end_of_month DATE;
BEGIN
    start_of_month := date_trunc('month', start_date);
    end_of_month := start_of_month + INTERVAL '1 month';
    partition_name := 'cp_rankings_' || to_char(start_of_month, 'YYYY_MM');
    
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I PARTITION OF cp_rankings
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
SELECT create_cp_monthly_partition(CURRENT_DATE);
SELECT create_cp_monthly_partition(CURRENT_DATE + INTERVAL '1 month');
SELECT create_cp_monthly_partition(CURRENT_DATE + INTERVAL '2 months');
SELECT create_cp_monthly_partition(CURRENT_DATE + INTERVAL '3 months');

-- 시간별 집계 테이블
CREATE TABLE IF NOT EXISTS cp_rankings_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  hour TIMESTAMP WITH TIME ZONE NOT NULL,
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

-- 시간별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_hourly_cp_rankings()
RETURNS void AS $$
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
    WHERE collected_at >= date_trunc('hour', CURRENT_TIMESTAMP - INTERVAL '1 hour')
        AND collected_at < date_trunc('hour', CURRENT_TIMESTAMP)
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

-- 일별 집계 함수
CREATE OR REPLACE FUNCTION aggregate_daily_cp_rankings()
RETURNS void AS $$
BEGIN
    INSERT INTO cp_rankings_daily (
        keyword_id, product_id, date, avg_rank, min_rank, max_rank,
        avg_price, min_price, max_price, is_rocket, avg_rating, appearance_count
    )
    SELECT 
        keyword_id,
        product_id,
        hour::DATE as date,
        AVG(avg_rank)::NUMERIC(5,2) as avg_rank,
        MIN(min_rank) as min_rank,
        MAX(max_rank) as max_rank,
        AVG(avg_price)::INTEGER as avg_price,
        MIN(min_price) as min_price,
        MAX(max_price) as max_price,
        MAX(is_rocket::int)::boolean as is_rocket,
        AVG(avg_rating)::NUMERIC(3,2) as avg_rating,
        SUM(appearance_count) as appearance_count
    FROM cp_rankings_hourly
    WHERE hour >= CURRENT_DATE - INTERVAL '1 day'
        AND hour < CURRENT_DATE
    GROUP BY keyword_id, product_id, hour::DATE
    ON CONFLICT (keyword_id, product_id, date) 
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

-- 오래된 파티션 백업 및 삭제 함수
CREATE OR REPLACE FUNCTION backup_and_drop_old_cp_partition()
RETURNS void AS $$
DECLARE
    oldest_month DATE;
    partition_name TEXT;
    backup_path TEXT;
    row_count BIGINT;
BEGIN
    -- 4개월 전 데이터 찾기
    oldest_month := date_trunc('month', CURRENT_DATE - INTERVAL '4 months');
    partition_name := 'cp_rankings_' || to_char(oldest_month, 'YYYY_MM');
    backup_path := '/backup/cp_rankings/' || to_char(oldest_month, 'YYYY_MM') || '.sql.gz';
    
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
END;
$$ LANGUAGE plpgsql;

-- 새 파티션 자동 생성 함수 (매월 실행)
CREATE OR REPLACE FUNCTION create_next_cp_partition()
RETURNS void AS $$
BEGIN
    -- 3개월 후 파티션 생성
    PERFORM create_cp_monthly_partition(CURRENT_DATE + INTERVAL '3 months');
    
    -- 오래된 파티션 백업 및 삭제
    PERFORM backup_and_drop_old_cp_partition();
END;
$$ LANGUAGE plpgsql;
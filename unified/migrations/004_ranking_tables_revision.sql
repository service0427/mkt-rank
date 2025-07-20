-- Rankings 테이블 재설계
-- 기존 시스템과 동일한 구조로 상세 정보 저장

-- 1. 기존 테이블 삭제 (cascade로 관련 데이터도 함께 삭제)
DROP TABLE IF EXISTS unified_current_rankings CASCADE;
DROP TABLE IF EXISTS unified_hourly_rankings CASCADE;
DROP TABLE IF EXISTS unified_daily_rankings CASCADE;

-- 2. 순위 상세 정보 테이블 (파티션 사용)
CREATE TABLE IF NOT EXISTS unified_rankings_detail (
  id UUID DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  keyword VARCHAR(200) NOT NULL,
  platform VARCHAR(50) NOT NULL, -- 'naver_shopping', 'coupang'
  
  -- 상품 정보
  product_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  image TEXT,
  lprice INTEGER,
  hprice INTEGER,
  mall_name VARCHAR(255),
  product_type VARCHAR(50),
  brand VARCHAR(255),
  maker VARCHAR(255),
  category1 VARCHAR(255),
  category2 VARCHAR(255),
  category3 VARCHAR(255),
  category4 VARCHAR(255),
  
  -- 순위 정보
  rank INTEGER NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- 쿠팡 전용 필드 (nullable)
  is_rocket BOOLEAN DEFAULT false,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  
  PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- 3. 현재 순위 테이블 (최신 데이터만)
CREATE TABLE IF NOT EXISTS unified_rankings_current (
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  
  -- 상품 정보
  title TEXT NOT NULL,
  link TEXT,
  image TEXT,
  lprice INTEGER,
  mall_name VARCHAR(255),
  brand VARCHAR(255),
  category1 VARCHAR(255),
  
  -- 순위 정보
  rank INTEGER NOT NULL,
  previous_rank INTEGER,
  rank_change INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN previous_rank IS NULL OR rank IS NULL THEN NULL
      ELSE previous_rank - rank
    END
  ) STORED,
  
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (keyword_id, platform, product_id)
);

-- 4. 시간별 집계 테이블
CREATE TABLE IF NOT EXISTS unified_rankings_hourly (
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  hour TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- 집계 데이터
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  sample_count INTEGER DEFAULT 1,
  
  -- 대표 정보
  title TEXT NOT NULL,
  lprice INTEGER,
  mall_name VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (keyword_id, platform, product_id, hour)
);

-- 5. 일별 집계 테이블
CREATE TABLE IF NOT EXISTS unified_rankings_daily (
  keyword_id UUID REFERENCES unified_search_keywords(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  
  -- 집계 데이터
  avg_rank NUMERIC(5,2),
  min_rank INTEGER,
  max_rank INTEGER,
  sample_count INTEGER DEFAULT 1,
  
  -- 대표 정보
  title TEXT NOT NULL,
  lprice INTEGER,
  mall_name VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (keyword_id, platform, product_id, date)
);

-- 6. 월별 파티션 생성 함수
CREATE OR REPLACE FUNCTION create_monthly_partition(table_date DATE)
RETURNS void AS $$
DECLARE
    partition_name TEXT;
    start_of_month DATE;
    end_of_month DATE;
BEGIN
    start_of_month := DATE_TRUNC('month', table_date);
    end_of_month := start_of_month + INTERVAL '1 month';
    partition_name := 'unified_rankings_detail_' || TO_CHAR(start_of_month, 'YYYY_MM');
    
    -- 파티션이 없으면 생성
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I PARTITION OF unified_rankings_detail
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
        
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS %I ON %I(platform, collected_at DESC)',
            'idx_' || partition_name || '_platform_collected',
            partition_name
        );
        
        RAISE NOTICE 'Created partition %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. 현재부터 4개월치 파티션 생성
SELECT create_monthly_partition(CURRENT_DATE);
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '1 month');
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '2 months');
SELECT create_monthly_partition(CURRENT_DATE + INTERVAL '3 months');

-- 8. 자동 파티션 관리 함수
CREATE OR REPLACE FUNCTION manage_partitions()
RETURNS void AS $$
DECLARE
    oldest_partition TEXT;
    oldest_date DATE;
BEGIN
    -- 4개월 이후 파티션 생성
    PERFORM create_monthly_partition(CURRENT_DATE + INTERVAL '3 months');
    
    -- 5개월 이상 된 파티션 찾기
    SELECT tablename INTO oldest_partition
    FROM pg_tables
    WHERE tablename LIKE 'unified_rankings_detail_%'
    AND tablename < 'unified_rankings_detail_' || TO_CHAR(CURRENT_DATE - INTERVAL '4 months', 'YYYY_MM')
    ORDER BY tablename
    LIMIT 1;
    
    -- 오래된 파티션 데이터를 파일로 백업하고 삭제
    IF oldest_partition IS NOT NULL THEN
        -- 백업 로직은 외부 스크립트로 처리
        RAISE NOTICE 'Partition % needs to be archived', oldest_partition;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 9. 인덱스 생성
CREATE INDEX idx_unified_rankings_current_keyword ON unified_rankings_current(keyword_id);
CREATE INDEX idx_unified_rankings_current_platform ON unified_rankings_current(platform);
CREATE INDEX idx_unified_rankings_current_collected ON unified_rankings_current(collected_at DESC);

CREATE INDEX idx_unified_rankings_hourly_keyword_hour ON unified_rankings_hourly(keyword_id, hour DESC);
CREATE INDEX idx_unified_rankings_hourly_platform_hour ON unified_rankings_hourly(platform, hour DESC);

CREATE INDEX idx_unified_rankings_daily_keyword_date ON unified_rankings_daily(keyword_id, date DESC);
CREATE INDEX idx_unified_rankings_daily_platform_date ON unified_rankings_daily(platform, date DESC);

-- 10. 트리거 함수: 현재 순위 업데이트
CREATE OR REPLACE FUNCTION update_current_ranking()
RETURNS TRIGGER AS $$
BEGIN
    -- 현재 순위 테이블 업데이트
    INSERT INTO unified_rankings_current (
        keyword_id, platform, product_id, title, link, image, 
        lprice, mall_name, brand, category1, rank, previous_rank, collected_at
    )
    VALUES (
        NEW.keyword_id, NEW.platform, NEW.product_id, NEW.title, NEW.link, NEW.image,
        NEW.lprice, NEW.mall_name, NEW.brand, NEW.category1, NEW.rank,
        (SELECT rank FROM unified_rankings_current 
         WHERE keyword_id = NEW.keyword_id AND platform = NEW.platform AND product_id = NEW.product_id),
        NEW.collected_at
    )
    ON CONFLICT (keyword_id, platform, product_id) DO UPDATE SET
        previous_rank = unified_rankings_current.rank,
        rank = EXCLUDED.rank,
        title = EXCLUDED.title,
        link = EXCLUDED.link,
        image = EXCLUDED.image,
        lprice = EXCLUDED.lprice,
        mall_name = EXCLUDED.mall_name,
        brand = EXCLUDED.brand,
        category1 = EXCLUDED.category1,
        collected_at = EXCLUDED.collected_at,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. 트리거 생성
CREATE TRIGGER trigger_update_current_ranking
AFTER INSERT ON unified_rankings_detail
FOR EACH ROW
EXECUTE FUNCTION update_current_ranking();
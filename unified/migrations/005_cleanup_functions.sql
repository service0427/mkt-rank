-- Daily 테이블 정리 함수 (30일 이상 된 데이터 삭제)
CREATE OR REPLACE FUNCTION cleanup_daily_rankings()
RETURNS void AS $$
BEGIN
    DELETE FROM unified_rankings_daily 
    WHERE date < CURRENT_DATE - INTERVAL '30 days';
    
    RAISE NOTICE 'Deleted daily rankings older than 30 days';
END;
$$ LANGUAGE plpgsql;

-- Hourly 테이블 정리 함수 (7일 이상 된 데이터 삭제)
CREATE OR REPLACE FUNCTION cleanup_hourly_rankings()
RETURNS void AS $$
BEGIN
    DELETE FROM unified_rankings_hourly 
    WHERE hour < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    RAISE NOTICE 'Deleted hourly rankings older than 7 days';
END;
$$ LANGUAGE plpgsql;

-- 매일 자정에 실행할 정리 작업
-- cron job이나 PM2로 스케줄링 필요
-- 예: SELECT cleanup_daily_rankings(); SELECT cleanup_hourly_rankings();
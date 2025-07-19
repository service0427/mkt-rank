-- API 키 테이블에 사용량 관련 컬럼 추가
ALTER TABLE unified_api_keys 
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 25000,
ADD COLUMN IF NOT EXISTS last_reset_at DATE DEFAULT CURRENT_DATE;

-- 사용량 추적을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used ON unified_api_keys(last_used_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_last_reset ON unified_api_keys(last_reset_at) WHERE deleted_at IS NULL;

-- 일일 사용량 리셋 함수
CREATE OR REPLACE FUNCTION reset_daily_api_usage() RETURNS void AS $$
BEGIN
    UPDATE unified_api_keys
    SET usage_count = 0,
        last_reset_at = CURRENT_DATE
    WHERE last_reset_at < CURRENT_DATE
      AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;
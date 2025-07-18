-- API 키 관리 테이블 (RLS 없음)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'naver_shopping', 'coupang' 등
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    description TEXT, -- 키 설명
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    rate_limit_count INTEGER DEFAULT 0, -- 레이트 리밋 발생 횟수
    last_rate_limit_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, client_id)
);

-- 인덱스
CREATE INDEX idx_api_keys_provider_active ON api_keys(provider, is_active);
CREATE INDEX idx_api_keys_last_used ON api_keys(last_used_at);

-- 업데이트 트리거
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_updated_at_trigger
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();
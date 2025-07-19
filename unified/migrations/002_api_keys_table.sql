-- API 키 관리 테이블
CREATE TABLE IF NOT EXISTS unified_api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('naver_shopping', 'coupang')),
  client_id VARCHAR(255) NOT NULL,
  client_secret TEXT NOT NULL, -- 암호화되어 저장됨
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- 삭제되지 않은 키 중에서 provider + client_id 조합은 유니크해야 함
  CONSTRAINT unified_api_keys_unique UNIQUE (provider, client_id, deleted_at)
);

-- 인덱스 생성
CREATE INDEX idx_api_keys_provider ON unified_api_keys(provider) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_active ON unified_api_keys(is_active) WHERE deleted_at IS NULL;

-- updated_at 트리거 추가
CREATE TRIGGER update_unified_api_keys_updated_at BEFORE UPDATE
    ON unified_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
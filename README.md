# MKT-Rank - Market Ranking Tracker

네이버 쇼핑 및 기타 플랫폼의 상품 순위를 추적하는 시스템입니다.

## 주요 기능

- 네이버 쇼핑 API를 통한 상품 순위 수집
- Supabase를 활용한 데이터 저장 및 관리
- 스케줄러를 통한 자동 수집
- API 사용량 모니터링
- Provider 패턴을 통한 확장 가능한 구조

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 값을 입력합니다:

```bash
cp .env.example .env
```

#### .env 파일 설정 예시:

```env
# Supabase 설정
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 네이버 API 키 (여러 개 설정 가능)
# 형식: CLIENT_ID:CLIENT_SECRET,CLIENT_ID2:CLIENT_SECRET2
NAVER_API_KEYS=abcd1234:secretkey1,efgh5678:secretkey2,ijkl9012:secretkey3

# 앱 설정
NODE_ENV=development
LOG_LEVEL=info

# 스케줄러 설정 (기본: 3시간마다)
SCHEDULE_INTERVAL=0 */3 * * *
```

### 3. Supabase 테이블 생성

**search_keywords 테이블은 이미 존재한다고 가정합니다.**

rankings 테이블만 생성하면 됩니다:

```sql
-- 쇼핑 순위 데이터 테이블
CREATE TABLE IF NOT EXISTS shopping_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID REFERENCES search_keywords(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  image TEXT,
  lprice INTEGER,
  hprice INTEGER,
  mall_name TEXT,
  product_type TEXT,
  brand TEXT,
  maker TEXT,
  category1 TEXT,
  category2 TEXT,
  category3 TEXT,
  category4 TEXT,
  rank INTEGER NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 성능 최적화를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_shopping_rankings_keyword_collected 
  ON shopping_rankings(keyword_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_rankings_product 
  ON shopping_rankings(product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_rankings_collected_at 
  ON shopping_rankings(collected_at DESC);

-- API 사용량 추적 테이블 (선택사항)
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT,
  keyword_id UUID,
  request_count INTEGER DEFAULT 1,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

## 테스트 실행

### 1. 데이터베이스 연결 테스트

```bash
npm run test:db
```

이 명령어는:
- Supabase 연결 확인
- search_keywords 테이블에서 키워드 조회
- rankings 테이블 존재 확인
- API 사용량 로깅 테스트

### 2. 네이버 쇼핑 API 테스트

```bash
# 기본 키워드 "노트북"으로 테스트
npm run test:search

# 특정 키워드로 테스트
npm run test:search "무선이어폰"
```

이 명령어는:
- 네이버 쇼핑 API 호출
- 검색 결과 표시 (상위 10개)
- API 키 사용 통계 표시

## 실행 방법

### 개발 환경

```bash
npm run dev
```

### 프로덕션 환경

```bash
npm run build
npm start
```

## 프로젝트 구조

```
mkt-rank/
├── src/
│   ├── config/           # 환경 설정
│   ├── services/         # 비즈니스 로직
│   │   ├── database/     # Supabase 연동
│   │   └── ranking/      # 순위 수집 로직
│   ├── providers/        # API Provider (네이버 쇼핑 등)
│   ├── schedulers/       # 스케줄러
│   ├── types/           # TypeScript 타입 정의
│   └── utils/           # 유틸리티 함수
└── tests/               # 테스트 파일
```

## 확장 가능성

### 새로운 플랫폼 추가

1. `providers/` 디렉토리에 새로운 Provider 클래스 생성
2. `BaseSearchProvider`를 상속받아 구현
3. `ranking.service.ts`에서 Provider 교체 또는 추가

### 플레이스 검색 추가 예시

```typescript
// providers/place-search.provider.ts
export class PlaceSearchProvider extends BaseSearchProvider {
  name = 'PlaceSearch';
  
  async search(keyword: string, limit?: number): Promise<SearchResult[]> {
    // 플레이스 검색 구현
  }
}
```

## 모니터링

- 로그 파일: `logs/` 디렉토리
- API 사용량: `api_usage` 테이블 확인
- 수집 상태: `rankings` 테이블의 `collected_at` 확인
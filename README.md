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

### 3. Supabase 테이블 생성

다음 SQL을 Supabase SQL Editor에서 실행합니다:

```sql
-- 키워드 테이블
CREATE TABLE keywords (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 순위 데이터 테이블
CREATE TABLE rankings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  price INTEGER,
  review_count INTEGER DEFAULT 0,
  mall_name TEXT,
  link TEXT,
  image_url TEXT,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(keyword_id, product_id, collected_at)
);

-- API 사용량 추적 테이블
CREATE TABLE api_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT,
  request_count INTEGER DEFAULT 1,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(provider, endpoint, date)
);

-- 인덱스 생성
CREATE INDEX idx_rankings_keyword_collected ON rankings(keyword_id, collected_at DESC);
CREATE INDEX idx_rankings_product ON rankings(product_id);
CREATE INDEX idx_api_usage_date ON api_usage(date, provider);
```

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

## 키워드 추가

Supabase 대시보드 또는 SQL Editor를 통해 키워드를 추가합니다:

```sql
INSERT INTO keywords (keyword, category) VALUES 
  ('노트북', '전자제품'),
  ('무선이어폰', '전자제품'),
  ('운동화', '패션');
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
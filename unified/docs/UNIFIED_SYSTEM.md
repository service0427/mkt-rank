# Unified Keyword Management System

## 시스템 개요

Unified Keyword Management System은 여러 서비스(mkt-guide.com, top.re.kr 등)의 키워드를 중앙에서 통합 관리하는 시스템입니다. 각 서비스의 키워드를 동기화하고, 순위 추적을 통합하며, 웹 UI를 통해 쉽게 관리할 수 있습니다.

### 주요 기능
- 멀티 서비스 키워드 통합 관리
- 실시간 양방향 동기화
- 웹 기반 관리 인터페이스
- 확장 가능한 서비스 어댑터 구조
- 통합 순위 추적 (300위까지)

### 지원 서비스
1. **mkt-guide.com** (Supabase)
   - 네이버 쇼핑 키워드
   - 쿠팡 키워드
   - 검색량 데이터 포함

2. **top.re.kr** (MySQL)
   - AD_SLOTS 키워드
   - MID 기반 순위 추적

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Web UI (Port 4000)                     │
│  ┌─────────┬──────────┬──────────┬──────────┬───────────┐  │
│  │Dashboard│ Services │ Keywords │   Sync   │  Rankings │  │
│  └─────────┴──────────┴──────────┴──────────┴───────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
┌─────────────────────────┴───────────────────────────────────┐
│                    Unified API Server                        │
│  ┌─────────────┬──────────────┬──────────────────────────┐ │
│  │   Routes    │  Controllers │    Service Adapters       │ │
│  └─────────────┴──────────────┴──────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                 Local PostgreSQL Database                    │
│  ┌──────────────┬─────────────────┬───────────────────────┐│
│  │unified_services│unified_keywords│unified_sync_logs      ││
│  └──────────────┴─────────────────┴───────────────────────┘│
└─────────────────────────┬───────────────────────────────────┘
                          │ Sync Workers
         ┌────────────────┴────────────────┐
         │                                 │
┌────────┴────────┐              ┌────────┴────────┐
│   Supabase DB   │              │    MySQL DB     │
│ (mkt-guide.com) │              │  (top.re.kr)    │
└─────────────────┘              └─────────────────┘
```

## 데이터베이스 스키마

### 1. unified_services
서비스 등록 및 관리 테이블

```sql
CREATE TABLE unified_services (
  service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code VARCHAR(50) UNIQUE NOT NULL,
  service_url VARCHAR(255) NOT NULL,
  service_name VARCHAR(100) NOT NULL,
  db_type VARCHAR(50) NOT NULL, -- 'supabase', 'mysql', 'postgresql'
  connection_config JSONB NOT NULL, -- 암호화된 연결 정보
  sync_config JSONB DEFAULT '{}', -- 동기화 설정
  field_mappings JSONB DEFAULT '{}', -- 필드 매핑 규칙
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. unified_search_keywords
통합 키워드 마스터 테이블

```sql
CREATE TABLE unified_search_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(200) NOT NULL,
  service_id UUID REFERENCES unified_services(service_id),
  
  -- 공통 필드
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 확장 필드
  metadata JSONB DEFAULT '{}',
  
  -- 검색량 데이터 (옵셔널)
  pc_count INTEGER DEFAULT 0,
  mobile_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  pc_ratio NUMERIC(5,2) DEFAULT 0,
  mobile_ratio NUMERIC(5,2) DEFAULT 0,
  
  -- 분류
  type VARCHAR(50) DEFAULT 'shopping',
  user_id UUID NULL,
  
  CONSTRAINT unified_keywords_unique UNIQUE (keyword, service_id, type)
);
```

### 3. unified_sync_logs
동기화 이력 관리

```sql
CREATE TABLE unified_sync_logs (
  sync_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id),
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
  sync_direction VARCHAR(20) NOT NULL, -- 'import', 'export'
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL, -- 'running', 'success', 'failed', 'partial'
  total_records INTEGER DEFAULT 0,
  success_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. unified_current_rankings
현재 순위 데이터

```sql
CREATE TABLE unified_current_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES unified_services(service_id),
  keyword_id UUID REFERENCES unified_search_keywords(id),
  keyword VARCHAR(200) NOT NULL,
  rank INTEGER,
  previous_rank INTEGER,
  rank_change INTEGER,
  platform VARCHAR(50) NOT NULL, -- 'naver_shopping', 'coupang'
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);
```

## API 엔드포인트

### 서비스 관리
- `GET /api/services` - 서비스 목록 조회
- `POST /api/services` - 서비스 등록
- `PUT /api/services/:id` - 서비스 정보 수정
- `DELETE /api/services/:id` - 서비스 삭제
- `POST /api/services/:id/test` - 연결 테스트

### 키워드 관리
- `GET /api/keywords` - 키워드 목록 (페이징, 필터)
- `POST /api/keywords` - 키워드 추가
- `PUT /api/keywords/:id` - 키워드 수정
- `DELETE /api/keywords/:id` - 키워드 삭제
- `POST /api/keywords/import` - CSV 가져오기
- `GET /api/keywords/export` - CSV 내보내기

### 동기화 관리
- `GET /api/sync/status` - 동기화 상태
- `POST /api/sync/trigger/:service` - 수동 동기화
- `GET /api/sync/logs` - 동기화 로그
- `PUT /api/sync/config/:service` - 동기화 설정 변경

### 순위 데이터
- `GET /api/rankings/current` - 현재 순위
- `GET /api/rankings/history` - 순위 이력
- `GET /api/rankings/compare` - 서비스간 비교

### 통계 및 모니터링
- `GET /api/stats/overview` - 전체 통계
- `GET /api/stats/services` - 서비스별 통계
- `GET /api/health` - 시스템 상태

## 웹 UI 페이지

### 1. 메인 대시보드 (/)
- 전체 서비스 상태 요약
- 총 키워드 수, 활성 서비스 수
- 최근 동기화 현황
- 실시간 수집 상태

### 2. 서비스 관리 (/services)
- 서비스 목록 조회
- 새 서비스 등록 폼
- 서비스 상세 정보 수정
- 연결 테스트
- 서비스 활성화/비활성화

### 3. 키워드 통합 검색 (/keywords)
- 실시간 키워드 검색
- 서비스별 필터링
- 키워드 추가/삭제
- CSV 가져오기/내보내기
- 중복 키워드 관리

### 4. 동기화 관리 (/sync)
- 동기화 스케줄 설정
- 수동 동기화 트리거
- 동기화 로그 조회
- 실시간 진행 상황

### 5. 순위 모니터링 (/rankings)
- 키워드별 순위 변동 추이
- 서비스별 순위 비교
- 실시간 수집 현황
- 순위 이상 감지 알림

### 6. API 키 관리 (/api-keys)
- 네이버 API 키 관리
- 서비스별 API 할당량
- API 사용량 통계

### 7. 시스템 설정 (/settings)
- 전역 설정 관리
- 알림 설정
- 백업/복원
- 로그 레벨 설정

## 서비스 어댑터

### BaseAdapter 인터페이스
```typescript
interface ServiceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  validateConnection(): Promise<boolean>;
  fetchKeywords(): Promise<Keyword[]>;
  syncKeywords(keywords: Keyword[]): Promise<SyncResult>;
  getFieldMappings(): FieldMapping[];
}
```

### 지원 어댑터
1. **SupabaseAdapter** - Supabase 데이터베이스 연동
2. **MySQLAdapter** - MySQL 데이터베이스 연동
3. **PostgreSQLAdapter** - PostgreSQL 데이터베이스 연동

## 순위 수집 통합

### 기존 시스템과의 통합
1. **기존 shopping_ranking 서비스 활용**
   - 초기에는 기존 순위 수집 로직 유지
   - maxPages를 1에서 3으로 증가 (300위까지)
   - 점진적으로 unified 시스템으로 마이그레이션

2. **통합 수집 전략**
   - Phase 1: 기존 서비스와 병행 운영
   - Phase 2: unified_collector가 모든 키워드 수집
   - Phase 3: 기존 서비스 종료

3. **API 제공자 통합**
   - 네이버 쇼핑 API (기존 NaverShoppingProvider 활용)
   - 쿠팡 API (기존 CoupangProvider 활용)
   - API 키는 기존 DB 관리 시스템 유지

## 동기화 로직

### 동기화 방향
1. **Import (가져오기)**: 외부 서비스 → Unified DB
2. **Export (내보내기)**: Unified DB → 외부 서비스
3. **Bidirectional (양방향)**: 양쪽 동기화

### 동기화 주기
- 기본: 1분
- 서비스별 커스터마이징 가능
- 수동 트리거 지원

### 충돌 해결
- 최신 업데이트 시간 기준
- 서비스 우선순위 설정 가능
- 수동 해결 옵션

## 신규 서비스 추가 가이드

### 1. 웹 UI에서 서비스 등록
1. `/services` 페이지에서 "새 서비스 추가" 클릭
2. 서비스 정보 입력:
   - 서비스 이름
   - 서비스 URL
   - DB 타입 선택
   - 연결 정보 입력
3. "연결 테스트" 실행
4. 성공 시 "저장"

### 2. 필드 매핑 설정
- 자동 감지된 필드 확인
- 드래그&드롭으로 매핑
- 변환 규칙 설정 (옵션)

### 3. 초기 동기화
- "지금 동기화" 버튼 클릭
- 진행률 모니터링
- 완료 후 결과 확인

### 4. 동기화 스케줄 설정
- 동기화 주기 선택
- 동기화 방향 설정
- 알림 설정

## 환경 변수

```env
# Node Environment
NODE_ENV=development

# Unified API Server
UNIFIED_API_PORT=4000

# Local PostgreSQL
LOCAL_PG_HOST=localhost
LOCAL_PG_PORT=5432
LOCAL_PG_DATABASE=mkt_rank_unified
LOCAL_PG_USER=postgres
LOCAL_PG_PASSWORD=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=3

# 동기화 설정
SYNC_INTERVAL_MINUTES=1
SYNC_BATCH_SIZE=1000

# 로깅
LOG_LEVEL=info
LOG_DIR=./logs
```

## PM2 프로세스 구성

```javascript
// ecosystem.config.js
{
  name: 'unified-web',
  script: './unified/dist/web/server.js',
  env: { PORT: 4000 }
},
{
  name: 'unified-sync',
  script: './unified/dist/sync/worker.js'
},
{
  name: 'unified-collector',
  script: './unified/dist/collector/worker.js'
}
```

## 구현 체크포인트

### Phase 1: 기본 구조 (완료)
- [x] 폴더 구조 생성
- [x] package.json 및 기본 설정
- [x] 타입 정의
- [x] 데이터베이스 스키마
- [x] 서비스 어댑터 기본 구현

### Phase 2: Web UI (완료)
- [x] Express 서버 설정
- [x] 기본 라우트 구조
- [x] Dashboard HTML
- [x] Services HTML
- [x] Keywords HTML
- [ ] Sync HTML
- [ ] Rankings HTML
- [ ] API Keys HTML
- [ ] Settings HTML

### Phase 3: 데이터베이스 연결 (완료)
- [x] PostgreSQL 연결 설정
- [ ] 초기 테이블 생성
- [ ] 연결 테스트

### Phase 4: API 구현 (부분 완료)
- [x] API 라우트 생성
- [ ] Services CRUD 실제 구현
- [ ] Keywords CRUD 실제 구현
- [ ] Sync 트리거 구현
- [ ] 통계 API 구현

### Phase 5: 동기화 워커 (완료)
- [x] Sync Worker 기본 구조
- [x] Supabase → Local 동기화
- [x] MySQL → Local 동기화
- [x] 스케줄러 설정

### Phase 6: 테스트 체크리스트
1. **서버 시작 테스트**
   ```bash
   cd unified
   npm run build
   npm start
   ```
   - [ ] 서버가 4000 포트에서 시작되는가?
   - [ ] http://localhost:4000 접속 가능한가?

2. **페이지 접근 테스트**
   - [ ] Dashboard 페이지 로드
   - [ ] Services 페이지 로드
   - [ ] 각 페이지 네비게이션 동작

3. **API 엔드포인트 테스트**
   - [ ] GET /api/health
   - [ ] GET /api/services
   - [ ] GET /api/stats/overview

4. **데이터베이스 연결 테스트**
   - [ ] Local PostgreSQL 연결
   - [ ] 테이블 생성 확인
   - [ ] 초기 데이터 삽입

5. **서비스 어댑터 테스트**
   - [ ] Supabase 연결 테스트
   - [ ] MySQL 연결 테스트
   - [ ] 키워드 가져오기 테스트

### Phase 7: 배포 준비
- [ ] PM2 설정 업데이트
- [ ] 환경변수 설정
- [ ] 로그 디렉토리 생성
- [ ] 빌드 및 배포 스크립트

## 알려진 이슈 및 TODO

### 타입스크립트 오류 (수정 필요)
- 사용하지 않는 매개변수 (_req로 변경 필요)
- 구현되지 않은 함수의 리턴 타입
- Controller 함수들의 실제 구현 필요

### 구현 필요 기능
- 실제 데이터베이스 쿼리
- 인증 미들웨어
- 에러 핸들링 개선
- WebSocket 실시간 업데이트
- CSV Import/Export
- 백업/복원 기능

## 변경 이력

### 2025-07-19 - 초기 버전
- 시스템 설계 및 문서 작성
- 기본 폴더 구조 생성
- 데이터베이스 스키마 정의
- API 엔드포인트 설계
- 웹 UI 페이지 구성
- 체크포인트 추가

---

**참고**: 이 문서는 시스템의 변경사항에 따라 지속적으로 업데이트됩니다.
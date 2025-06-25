# Queue System 사용 가이드

## 개요
키워드가 많아질수록 순차 처리로 인한 지연이 발생하는 문제를 해결하기 위해 Bull Queue 기반의 병렬 처리 시스템을 구현했습니다.

## 주요 개선사항

### 1. 병렬 처리
- 기존: 키워드를 순차적으로 처리 (5개 키워드 = 약 10분)
- 개선: 3-5개 키워드를 동시에 병렬 처리
- 중복 방지: Queue에 이미 있는 키워드는 추가하지 않음

### 2. 실시간 모니터링
- 웹 기반 대시보드: http://localhost:3001/monitor
- Queue 상태, API 성능, 시스템 상태 실시간 확인
- 시간대별 수집 현황 그래프
- 키워드별 수집 성능 추적

## 설치 및 실행

### 1. Redis 설치 (Queue 시스템 필수)
```bash
# Docker를 사용하는 경우 (권장)
npm run redis:start

# 또는 로컬에 Redis 설치
brew install redis  # macOS
sudo apt-get install redis-server  # Ubuntu
```

### 2. Queue 시스템 실행
```bash
# 개발 모드
npm run dev:queue

# 프로덕션 모드
npm run build
npm run start:queue
```

### 3. 환경 변수 설정
```bash
# Queue 동시 처리 개수 (기본값: 3)
QUEUE_CONCURRENCY=3

# Redis 연결 정보 (기본값: localhost:6379)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # 필요한 경우
```

## 모니터링 대시보드

### 접속 방법
1. Queue 시스템 실행 후 http://localhost:3001/monitor 접속
2. 10초마다 자동 업데이트

### 주요 메트릭
- **Queue Status**: 대기중/진행중/완료된 작업 수
- **API Performance**: 성공률, 평균 응답시간
- **System Health**: 메모리 사용량, 업타임
- **Hourly Chart**: 시간대별 API 호출 현황
- **Keyword Performance**: 키워드별 수집 주기 및 성능

## API 엔드포인트

### Queue 상태 확인
```bash
GET /api/monitor/queue-status
```

### 수집 이력 조회
```bash
GET /api/monitor/collection-history?hours=24
```

### 키워드별 성능
```bash
GET /api/monitor/keyword-performance
```

### 시스템 상태
```bash
GET /api/monitor/system-health
```

## 성능 비교

### 기존 방식 (순차 처리)
- 5개 키워드: 약 10분
- 10개 키워드: 약 20분
- 병목: API 지연시간 누적

### Queue 방식 (병렬 처리)
- 5개 키워드: 약 3-4분
- 10개 키워드: 약 6-8분
- 동시 처리로 시간 단축

## 주의사항

1. **Redis 필수**: Queue 시스템은 Redis가 필요합니다
2. **API 제한**: 네이버 API 일일 25,000건 제한 준수
3. **동시성 조절**: QUEUE_CONCURRENCY를 너무 높이면 Rate Limit 발생 가능

## 문제 해결

### Redis 연결 실패
```bash
# Redis 상태 확인
docker ps  # Docker 사용 시
redis-cli ping  # 로컬 설치 시
```

### Queue가 막힌 경우
```bash
# Queue 초기화 (주의: 모든 대기 작업 삭제)
curl -X POST http://localhost:3001/api/monitor/clear-queue
```

### 성능이 느린 경우
1. QUEUE_CONCURRENCY 값 증가 (최대 5 권장)
2. Redis 메모리 확인
3. 네트워크 상태 확인
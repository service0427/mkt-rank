# 쿠팡 API 속도 제한 설정

## 구현된 변경사항

### 1. 큐 동시 처리 수 분리
- 쇼핑 키워드: 기본 3개 동시 처리 (QUEUE_CONCURRENCY)
- 쿠팡 키워드: 기본 1개 동시 처리 (COUPANG_QUEUE_CONCURRENCY)

### 2. API 호출 간 딜레이
- 쿠팡 키워드 처리 후: **2-15초 랜덤 딜레이**
- 수동 수집 시: **2-15초 랜덤 딜레이**

### 3. 큐 추가 시 초기 딜레이
- 쿠팡 키워드만: **0-5초 랜덤 초기 딜레이**
- 키워드가 동시에 처리되지 않도록 분산

### 4. 재시도 백오프 전략
- 1차 재시도: 5-10분 대기
- 2차 재시도: 10-15분 대기
- 3차 재시도: 15-20분 대기

## 환경변수 설정

```bash
# .env 파일에 추가
QUEUE_CONCURRENCY=3              # 쇼핑 키워드 동시 처리 수
COUPANG_QUEUE_CONCURRENCY=1      # 쿠팡 키워드 동시 처리 수 (권장: 1)
```

## 서버 적용 방법

1. 환경변수 설정
```bash
export COUPANG_QUEUE_CONCURRENCY=1
```

2. PM2 재시작
```bash
pm2 restart mkt-rank-queue
```

## 모니터링

```bash
# 쿠팡 키워드 처리 로그 확인
pm2 logs mkt-rank-queue | grep -i "coupang"

# 딜레이 적용 확인
pm2 logs mkt-rank-queue | grep -i "delay"

# 블록된 키워드 재시도 확인
pm2 logs mkt-rank-queue | grep -i "blocked"
```

## 쿠팡 순위 측정 제어

### 현재 상태
**쿠팡 키워드는 자동 스케줄러에서 제외됨** (수동 테스트 중)
- 쇼핑 키워드만 자동으로 수집
- 쿠팡은 수동 명령어로만 실행 가능

### 1. 쿠팡 수동 테스트 명령어
```bash
# 단일 키워드 테스트
curl -X POST http://localhost:3001/api/coupang/check \
  -H "Content-Type: application/json" \
  -d '{"keyword": "테스트키워드"}'

# 여러 키워드 테스트
curl -X POST http://localhost:3001/api/coupang/check-multiple \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["키워드1", "키워드2", "키워드3"]}'

# 전체 쿠팡 키워드 수집 (큐 사용)
curl -X POST http://localhost:3001/api/monitor/trigger-coupang-collection

# 전체 쿠팡 키워드 수집 및 동기화
curl -X POST http://localhost:3001/api/coupang/collect-all
```

### 2. 큐 삭제 명령어
```bash
# 전체 큐 삭제
curl -X POST http://localhost:3001/api/monitor/clear-queue \
  -H "Content-Type: application/json"

# 쿠팡 키워드만 삭제
curl -X POST http://localhost:3001/api/monitor/clear-queue \
  -H "Content-Type: application/json" \
  -d '{"type": "cp"}'

# 쇼핑 키워드만 삭제
curl -X POST http://localhost:3001/api/monitor/clear-queue \
  -H "Content-Type: application/json" \
  -d '{"type": "shopping"}'
```

### 3. 큐 상태 확인
```bash
# 현재 큐 상태 확인
curl http://localhost:3001/api/monitor/queue-status
```

## 권장 설정
- 쿠팡 동시 처리: 1개 (안전)
- API 호출 간격: 2-15초
- 큐 추가 초기 딜레이: 0-5초
- 최대 재시도: 3회
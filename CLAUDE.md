# Claude 명령어 참고

## 린트 및 타입 체크
```bash
npm run lint
npm run typecheck
```

## 쿠팡 관련 API 엔드포인트

### 1. 쿠팡 전체 키워드 수동 수집 (큐 사용)
```bash
curl -X POST http://localhost:3333/api/monitor/trigger-coupang-collection
```

### 2. 쿠팡 전체 키워드 수동 수집 및 싱크 (큐 미사용)
```bash
curl -X POST http://localhost:3333/api/coupang/collect-all
```

### 3. 쿠팡 싱크만 수동 실행
```bash
curl -X POST http://localhost:3333/api/coupang/sync-only
```

### 4. 쿠팡 단일 키워드 체크
```bash
curl -X POST http://localhost:3333/api/coupang/check \
  -H "Content-Type: application/json" \
  -d '{"keyword": "검색할키워드"}'
```

### 5. 쿠팡 다중 키워드 체크
```bash
curl -X POST http://localhost:3333/api/coupang/check-multiple \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["키워드1", "키워드2", "키워드3"]}'
```

## 쇼핑 및 쿠팡 전체 수동 실행
```bash
curl -X POST http://localhost:3333/api/monitor/trigger-collection
```

## 큐 상태 확인
```bash
curl http://localhost:3333/api/monitor/queue-status
```
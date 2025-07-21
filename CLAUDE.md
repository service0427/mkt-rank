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

## 순위 조회 API

### 키워드 + MID로 순위 조회 (GET)
```bash
curl "http://localhost:4000/api/rank/check?keyword=무선청소기&code=89509068883"
```

### 키워드 + MID로 순위 조회 (POST)
```bash
curl -X POST http://localhost:4000/api/rank/check \
  -H "Content-Type: application/json" \
  -d '{"keyword": "무선청소기", "code": "89509068883"}'
```

### 응답 예시
```json
{
  "success": true,
  "keyword": "무선청소기",
  "code": "89509068883",
  "rank": 5,
  "product": {
    "name": "2025년형 차이슨 무선 청소기 초경량 가성비 스틱 원룸",
    "href": "https://search.shopping.naver.com/catalog/89509068883",
    "thumbnail": "https://shopping-phinf.pstatic.net/main_89509068883/89509068883.jpg",
    "page": 1
  },
  "collected_at": "2025-07-21T14:07:34.412Z"
}

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

## API 키 관리

### 1. API 키 목록 조회
```bash
curl http://localhost:3001/api/keys
```

### 2. API 키 추가
```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "naver_shopping",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "description": "키 설명"
  }'
```

### 3. API 키 검증
```bash
curl -X POST http://localhost:3001/api/keys/validate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "naver_shopping",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

### 4. API 키 관리 페이지
```
http://localhost:3001/api-keys
```

## 네이버 API 직접 호출 (실시간 데이터)

### 키워드 검색 (네이버 API 직접)
```bash
curl "https://mkt.techb.kr:4443/api/naver/search?keyword=키보드&display=10"
```

### 특정 상품 순위 찾기 (네이버 API 직접)
```bash
curl "https://mkt.techb.kr:4443/api/naver/search/키보드/88757865230"
```

## Unified 시스템 배포
```bash
cd ~/mkt-rank/unified
pm2 restart unified-web
```

## HTTPS 접속 정보
- HTTP: http://mkt.techb.kr:4000
- HTTPS: https://mkt.techb.kr:4443
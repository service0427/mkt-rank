# AD_SLOTS 시스템 가이드

## 개요
MySQL `ad_slots` 테이블의 제품들을 MID 기반으로 정확하게 매칭하여 순위를 추적하는 독립적인 시스템

## 빠른 시작

### 1. 환경 설정 (.env)
```bash
# 기본 설정
AD_SLOTS_ENABLED=true
AD_SLOTS_REDIS_DB=2

# Phase 2 설정 (API 키 4개 기준)
AD_SLOTS_MAX_KEYWORDS=2000
AD_SLOTS_SCHEDULE_CRON="0 */3 * * *"  # 3시간마다
AD_SLOTS_QUEUE_CONCURRENCY=10
```

### 2. 데이터베이스 설정
```bash
# PostgreSQL 테이블 생성
psql -U postgres -d postgres < src/database/migrations/create-ad-slot-tables.sql
```

### 3. 실행
```bash
npm run build
pm2 start ecosystem.config.js --only mkt-rank-ad-slots
```

## API 엔드포인트

- `GET /api/ad-slots/status` - 시스템 상태
- `GET /api/ad-slots/scaling-status` - 스케일링 상태 및 권장사항
- `POST /api/ad-slots/collect` - 전체 수집 시작
- `GET /api/ad-slots/slots` - 활성 슬롯 목록

## 점진적 확장 전략

### 현재 단계 (Phase 2)
- API 키: 4개
- 처리 키워드: 2,000개
- 일일 API 호출: 48,000회 (키당 12,000회)

### 다음 단계
1. **1-2주 후**: API 키 3개 추가 → 5,000개 키워드
2. **3-4주 후**: API 키 3개 추가 → 8,000개 키워드
3. **5-6주 후**: API 키 2-5개 추가 → 10,000개 키워드

## 모니터링

```bash
# 상태 확인
curl http://localhost:3333/api/ad-slots/scaling-status

# PM2 로그
pm2 logs mkt-rank-ad-slots

# 큐 상태
curl http://localhost:3333/api/ad-slots/status | jq .queue
```

## 주의사항
- 기존 서비스와 완전 분리 (별도 Redis DB, 별도 프로세스)
- API 키 사용률 80% 이하 유지
- 에러율 1% 이하 유지 필요
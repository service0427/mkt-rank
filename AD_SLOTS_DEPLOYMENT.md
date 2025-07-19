# AD_SLOTS 서버 배포 가이드

## 1. 코드 배포

```bash
# 서버에서
cd /path/to/mkt-rank
git pull origin main
npm install
npm run build
```

## 2. 환경 변수 설정 (.env)

서버의 `.env` 파일에 다음 설정을 추가하세요:

```bash
# ==================== AD_SLOTS 설정 ====================
# 기본 활성화 설정 (처음엔 false로 시작)
AD_SLOTS_ENABLED=false

# MySQL 연결 (기존 MYSQL_ 설정 사용하거나 별도 지정)
# AD_SLOTS_MYSQL_HOST=138.2.125.63
# AD_SLOTS_MYSQL_USER=magic_dev
# AD_SLOTS_MYSQL_PASSWORD=your_password
# AD_SLOTS_MYSQL_DATABASE=magic_db

# Redis 설정 (별도 DB 사용)
AD_SLOTS_REDIS_DB=2

# 처리할 키워드 수 제한 (Phase 2: API키 4개 기준)
AD_SLOTS_MAX_KEYWORDS=2000

# 스케줄 설정
AD_SLOTS_SCHEDULE_CRON="0 */3 * * *"  # 3시간마다
AD_SLOTS_BATCH_SIZE=100               # 배치 크기
AD_SLOTS_MAX_PAGES=3                  # 3페이지(300위)까지
AD_SLOTS_DELAY_BETWEEN_KEYWORDS=2000  # 키워드간 2초
AD_SLOTS_DELAY_BETWEEN_PAGES=500     # 페이지간 0.5초

# Queue 설정
AD_SLOTS_QUEUE_CONCURRENCY=10         # 동시 10개 처리
AD_SLOTS_QUEUE_MAX_RETRIES=1          # 재시도 1회
AD_SLOTS_QUEUE_RETRY_DELAY=5000       # 재시도 대기 5초

# PostgreSQL 설정 (로컬 DB)
LOCAL_PG_HOST=localhost
LOCAL_PG_PORT=5432
LOCAL_PG_DATABASE=postgres
LOCAL_PG_USER=postgres
LOCAL_PG_PASSWORD=
```

## 3. PostgreSQL 테이블 생성

```bash
# PostgreSQL 로컬 DB에 테이블 생성
psql -U postgres -d postgres < src/database/migrations/create-ad-slot-tables.sql

# 또는 수동으로 실행
psql -U postgres -d postgres
\i /path/to/mkt-rank/src/database/migrations/create-ad-slot-tables.sql
```

## 4. PM2 실행

```bash
# 기존 프로세스 확인
pm2 list

# AD_SLOTS 워커만 시작 (비활성 상태로)
pm2 start ecosystem.config.js --only mkt-rank-ad-slots

# 또는 전체 재시작
pm2 restart ecosystem.config.js

# 저장 (재부팅 시 자동 시작)
pm2 save
```

## 5. 테스트 및 활성화

### 5.1 상태 확인
```bash
# AD_SLOTS 상태 확인 (비활성 상태)
curl http://localhost:3333/api/ad-slots/status

# 응답 예시
{
  "error": "AD_SLOTS feature is disabled",
  "message": "Set AD_SLOTS_ENABLED=true to enable this feature"
}
```

### 5.2 활성화
```bash
# .env 파일 수정
vim .env
# AD_SLOTS_ENABLED=true 로 변경

# PM2 재시작
pm2 restart mkt-rank-ad-slots

# 다시 상태 확인
curl http://localhost:3333/api/ad-slots/status
```

### 5.3 스케일링 상태 확인
```bash
# API 키와 처리 가능 키워드 확인
curl http://localhost:3333/api/ad-slots/scaling-status | jq

# 응답 예시
{
  "phase": 2,
  "apiKeys": {
    "total": 4,
    "healthy": 4,
    "dailyCapacity": 100000,
    "currentUsage": 0,
    "usagePercent": 0
  },
  "keywords": {
    "totalAvailable": 10000,
    "currentlyActive": 2000,
    "processingCapacity": 3332,
    "recommendation": "optimal"
  }
}
```

### 5.4 수동 테스트
```bash
# 특정 슬롯 테스트 (예: ad_slot_id = 1)
curl -X POST http://localhost:3333/api/ad-slots/collect/1

# 활성 슬롯 목록 확인
curl http://localhost:3333/api/ad-slots/slots?limit=10 | jq
```

## 6. 모니터링

```bash
# PM2 로그 실시간 확인
pm2 logs mkt-rank-ad-slots

# 로그 파일 직접 확인
tail -f logs/pm2-ad-slots-out.log
tail -f logs/pm2-ad-slots-error.log

# 큐 상태 모니터링
watch -n 10 'curl -s http://localhost:3333/api/ad-slots/status | jq .queue'
```

## 7. 문제 해결

### AD_SLOTS가 시작되지 않을 때
```bash
# 1. 환경변수 확인
pm2 env mkt-rank-ad-slots | grep AD_SLOTS

# 2. 에러 로그 확인
pm2 logs mkt-rank-ad-slots --err --lines 100

# 3. 수동으로 실행해보기
AD_SLOTS_ENABLED=true node dist/start-ad-slots-worker.js
```

### API 오류 발생 시
```bash
# API 키 상태 확인
curl http://localhost:3333/api/keys/status

# PostgreSQL 연결 확인
psql -U postgres -d postgres -c "SELECT COUNT(*) FROM ad_slot_rankings;"
```

### 긴급 중지
```bash
# AD_SLOTS만 중지
pm2 stop mkt-rank-ad-slots

# 또는 환경변수로 비활성화
echo "AD_SLOTS_ENABLED=false" >> .env
pm2 restart mkt-rank-ad-slots
```

## 8. 단계별 확장

### Phase 2 (현재) → Phase 3 전환
```bash
# API 키 추가 후
# .env 수정
AD_SLOTS_MAX_KEYWORDS=5000  # 2000 → 5000
AD_SLOTS_QUEUE_CONCURRENCY=15  # 10 → 15

# 재시작
pm2 restart mkt-rank-ad-slots
```

## 9. 일일 점검 사항

```bash
# 매일 확인할 명령어 모음
echo "=== AD_SLOTS Daily Check ==="
echo "1. Queue Status:"
curl -s http://localhost:3333/api/ad-slots/status | jq .queue

echo -e "\n2. API Key Usage:"
curl -s http://localhost:3333/api/ad-slots/scaling-status | jq .apiKeys

echo -e "\n3. Today's Progress:"
curl -s http://localhost:3333/api/ad-slots/status | jq .database

echo -e "\n4. Recent Errors:"
pm2 logs mkt-rank-ad-slots --err --lines 20 --nostream
```

## 10. 보안 주의사항

- MySQL 비밀번호는 절대 커밋하지 마세요
- .env 파일 권한 확인: `chmod 600 .env`
- API 엔드포인트는 내부망에서만 접근 가능하도록 설정
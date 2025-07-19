# 2단계 상세 가이드: 서버 배포

## 2-1. 코드 가져오기

```bash
# 서버 접속
ssh your-server

# 프로젝트 디렉토리로 이동
cd /path/to/mkt-rank

# 현재 브랜치 확인
git status
git branch

# 최신 코드 가져오기
git fetch origin
git pull origin feature/jicho

# 의존성 설치 (새로운 패키지가 있을 수 있음)
npm install
```

## 2-2. 환경변수 설정 (.env)

```bash
# 1. 기존 .env 백업 (중요!)
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 2. .env 파일 편집
vim .env

# 3. 맨 아래에 다음 내용 추가
# ==================== AD_SLOTS Configuration ====================
# AD_SLOTS 시스템 (처음엔 비활성화)
AD_SLOTS_ENABLED=false

# MySQL 연결 (기존 MYSQL_ 설정 사용)
# 별도로 설정하지 않으면 기존 MySQL 설정을 사용합니다

       # Redis 설정 (별도 DB 사용 - 중요!)
       AD_SLOTS_REDIS_DB=2  # 기존이 0번이므로 2번 사용

       # 키워드 수 제한 (API 키 4개 기준)
       AD_SLOTS_MAX_KEYWORDS=2000

# 스케줄 설정
AD_SLOTS_SCHEDULE_CRON="0 */3 * * *"  # 3시간마다
AD_SLOTS_BATCH_SIZE=100
AD_SLOTS_MAX_PAGES=3                  # 300위까지
AD_SLOTS_DELAY_BETWEEN_KEYWORDS=2000  # 2초
AD_SLOTS_DELAY_BETWEEN_PAGES=500     # 0.5초

# Queue 설정
AD_SLOTS_QUEUE_CONCURRENCY=10
AD_SLOTS_QUEUE_MAX_RETRIES=1
AD_SLOTS_QUEUE_RETRY_DELAY=5000

# PostgreSQL 로컬 DB (있는 경우)
LOCAL_PG_HOST=localhost
LOCAL_PG_PORT=5432
LOCAL_PG_DATABASE=postgres
LOCAL_PG_USER=postgres
LOCAL_PG_PASSWORD=your_password_here  # 실제 비밀번호 입력

# 4. 저장 후 확인
cat .env | grep AD_SLOTS
```

## 2-3. PostgreSQL 테이블 생성

### 옵션 A: 데이터 관리 기능 포함 (권장)
```bash
# PostgreSQL 접속 확인
psql -U postgres -d postgres -c "SELECT version();"

# 테이블 생성 (데이터 정리 함수 포함)
psql -U postgres -d postgres < src/database/migrations/create-ad-slot-tables-with-cleanup.sql

# 생성 확인
psql -U postgres -d postgres -c "\dt ad_slot_*"
```

### 옵션 B: 기본 테이블만 생성
```bash
psql -U postgres -d postgres < src/database/migrations/create-ad-slot-tables.sql
```

### PostgreSQL 없는 경우
```bash
# PostgreSQL 설치 (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# 설정
sudo -u postgres psql
CREATE DATABASE postgres;
\q

# 다시 테이블 생성 시도
```

## 2-4. 빌드

```bash
# TypeScript 컴파일
npm run build

# 빌드 성공 확인
ls -la dist/start-ad-slots-worker.js
ls -la dist/database/migrations/
ls -la dist/views/ad-slots-dashboard.html
```

## 2-5. 데이터 관리 계획

### 예상 데이터 증가량
```
10,000 키워드 × 8회/일 × 30일 = 2,400,000 rows/월
약 2-3GB/월 예상
```

### 자동 정리 설정 (선택사항)
```bash
# Crontab에 추가
crontab -e

# 매일 새벽 3시 데이터 정리
0 3 * * * psql -U postgres -d postgres -c "SELECT cleanup_old_rankings(); SELECT cleanup_old_api_logs();"

# 매주 일요일 시간별 데이터 집계
0 4 * * 0 psql -U postgres -d postgres -c "SELECT aggregate_and_cleanup_hourly();"

# 매월 25일 다음달 파티션 생성
0 0 25 * * psql -U postgres -d postgres -c "SELECT create_monthly_partition();"
```

### 수동 정리 명령어
```bash
# 30일 이상 된 데이터 삭제
psql -U postgres -d postgres -c "SELECT cleanup_old_rankings();"

# 테이블 크기 확인
psql -U postgres -d postgres -c "
SELECT tablename, 
       pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size
FROM pg_tables
WHERE tablename LIKE 'ad_slot_%'
ORDER BY pg_total_relation_size(tablename::regclass) DESC;"
```

## 2-6. 백업 설정 (권장)

```bash
# 백업 디렉토리 생성
mkdir -p ~/backups/ad_slots

# 백업 스크립트 생성
cat > ~/backups/backup_ad_slots.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/backups/ad_slots
DATE=$(date +%Y%m%d_%H%M%S)

# 현재 상태 백업 (CSV)
psql -U postgres -d postgres -c "\COPY (SELECT * FROM ad_slot_current_state) TO '$BACKUP_DIR/current_state_$DATE.csv' CSV HEADER;"

# 일일 통계 백업
psql -U postgres -d postgres -c "\COPY (SELECT * FROM ad_slot_daily_stats) TO '$BACKUP_DIR/daily_stats_$DATE.csv' CSV HEADER;"

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "*.csv" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x ~/backups/backup_ad_slots.sh

# Crontab에 추가 (매일 새벽 2시)
# 0 2 * * * ~/backups/backup_ad_slots.sh
```

## 체크리스트

- [ ] .env 백업 완료
- [ ] .env에 AD_SLOTS 설정 추가 (ENABLED=false)
- [ ] PostgreSQL 테이블 생성 완료
- [ ] 빌드 성공 확인
- [ ] 데이터 정리 계획 수립
- [ ] 백업 설정 (선택사항)

## 문제 해결

### PostgreSQL 연결 실패
```bash
# 상태 확인
sudo systemctl status postgresql

# 로그 확인
sudo tail -f /var/log/postgresql/*.log

# 연결 테스트
psql -U postgres -h localhost -d postgres
```

### 빌드 실패
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install

# TypeScript 버전 확인
npx tsc --version
```

다음 단계(PM2 추가)로 진행하시겠습니까?
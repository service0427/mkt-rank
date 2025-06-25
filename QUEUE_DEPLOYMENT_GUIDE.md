# Queue 시스템 서버 배포 가이드

## 개요
Queue 시스템은 기존의 단순 스케줄러와 달리 Redis를 사용하여 작업을 관리하고 병렬 처리를 가능하게 합니다.

## 기존 방식 vs Queue 방식 비교

### 기존 방식 (단순 스케줄러)
```
키워드1 → 처리(2분) → 키워드2 → 처리(2분) → 키워드3 → 처리(2분)
총 시간: 6분
```

### Queue 방식 (병렬 처리)
```
키워드1 → 처리 ┐
키워드2 → 처리 ├─ 동시 처리
키워드3 → 처리 ┘
총 시간: 2분
```

## Queue 시스템 구조

```
┌─────────────┐     ┌──────────┐     ┌─────────────┐
│  Scheduler  │ --> │  Redis   │ --> │   Workers   │
│ (키워드추가) │     │ (Queue)  │     │ (병렬처리)  │
└─────────────┘     └──────────┘     └─────────────┘
       ↓                                      ↓
   매시간 실행                            API 호출 & DB 저장
```

## 서버 배포 방법

### 1. 사전 준비사항

#### Redis 설치 (필수)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# CentOS/RHEL
sudo yum install epel-release
sudo yum install redis
sudo systemctl enable redis
sudo systemctl start redis
```

#### 환경 변수 설정
```bash
# .env 파일
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
NAVER_API_KEYS=clientId1:secret1,clientId2:secret2

# Queue 관련 설정
QUEUE_CONCURRENCY=3  # 동시 처리 작업 수 (3-5 권장)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Redis 비밀번호 (있는 경우)

# 스케줄 설정
SCHEDULE_INTERVAL=0 * * * *  # 매시간 정각
```

### 2. 코드 배포

```bash
# 1. 코드 클론 또는 업데이트
git clone [repository_url]
cd mkt-rank

# 2. 의존성 설치
npm install

# 3. TypeScript 빌드
npm run build

# 4. PM2로 실행 (권장)
npm install -g pm2
```

### 3. PM2 설정 파일 생성

`ecosystem.config.js` 파일 생성:
```javascript
module.exports = {
  apps: [
    {
      name: 'mkt-rank-queue',
      script: './dist/index-queue.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        QUEUE_CONCURRENCY: '3'
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_file: 'logs/combined.log',
      time: true
    }
  ]
};
```

### 4. 서비스 시작

```bash
# PM2로 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 로그 확인
pm2 logs mkt-rank-queue

# 재시작
pm2 restart mkt-rank-queue

# 시스템 재부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

### 5. 모니터링 접속

```bash
# 서버 포트 열기 (필요시)
sudo ufw allow 3001

# 브라우저에서 접속
http://your-server-ip:3001/monitor
```

## 실행 로그 확인

### 파일 로그 위치
```
/path/to/mkt-rank/logs/execution-YYYY-MM-DD.log
```

### 로그 형식
```
2024-12-30T10:00:00.000Z | SCHEDULER_START | {"time":"2024-12-30T10:00:00.000Z","timezone":"Asia/Seoul"}
2024-12-30T10:00:01.000Z | COLLECTION_START | {"keywordCount":5,"startTime":"2024-12-30T10:00:01.000Z"}
2024-12-30T10:00:15.000Z | KEYWORD_PROCESSED | {"keyword":"신발","success":true,"duration":3245}
```

### API로 로그 조회
```bash
curl http://localhost:3001/api/monitor/execution-logs
```

## 문제 해결

### 1. Redis 연결 실패
```bash
# Redis 상태 확인
sudo systemctl status redis

# Redis 연결 테스트
redis-cli ping
# 응답: PONG
```

### 2. 스케줄러가 실행되지 않음
- 로그 파일 확인: `logs/execution-*.log`
- PM2 로그 확인: `pm2 logs`
- 시간대 설정 확인 (Asia/Seoul)

### 3. Queue가 막힌 경우
```bash
# Redis CLI로 Queue 상태 확인
redis-cli
> keys bull:*
> del bull:ranking-collection:*  # 주의: 모든 작업 삭제
```

### 4. 메모리 사용량이 높은 경우
```bash
# PM2 재시작
pm2 restart mkt-rank-queue

# 메모리 제한 설정 (ecosystem.config.js)
max_memory_restart: '500M'
```

## 성능 튜닝

### 1. 동시성 조정
```bash
# 서버 성능에 따라 조정
QUEUE_CONCURRENCY=5  # 고성능 서버
QUEUE_CONCURRENCY=2  # 저성능 서버
```

### 2. Redis 메모리 설정
```bash
# /etc/redis/redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. API 호출 간격 조정
```javascript
// config/index.ts
delayBetweenRequests: 500  // 더 빠르게 (주의: Rate limit)
```

## 모니터링 체크리스트

매일 확인해야 할 사항:
1. [ ] Queue 대기 작업 수 (50개 이하 정상)
2. [ ] API 성공률 (95% 이상 정상)
3. [ ] 실행 로그에서 SCHEDULER_SKIPPED 확인
4. [ ] 메모리 사용량 (1GB 이하 정상)
5. [ ] Redis 연결 상태

## 백업 및 복구

### 로그 백업
```bash
# 일일 로그 백업
tar -czf logs-$(date +%Y%m%d).tar.gz logs/

# S3로 백업 (AWS CLI 필요)
aws s3 cp logs-$(date +%Y%m%d).tar.gz s3://your-bucket/logs/
```

### 기존 방식으로 롤백
```bash
# Queue 시스템 중지
pm2 stop mkt-rank-queue

# 기존 스케줄러 실행
pm2 start dist/index.js --name mkt-rank-scheduler
```

## 주의사항

1. **Redis 필수**: Queue 시스템은 Redis 없이 작동하지 않습니다
2. **메모리 관리**: Redis와 Node.js 프로세스 메모리 모니터링 필요
3. **로그 관리**: 로그 파일이 계속 쌓이므로 주기적 삭제 필요
4. **네트워크**: Redis와 API 서버 간 네트워크 안정성 중요

## 지원 및 문의

문제 발생 시:
1. 실행 로그 파일 확인
2. PM2 로그 확인
3. 모니터링 대시보드 확인
4. Redis 상태 확인
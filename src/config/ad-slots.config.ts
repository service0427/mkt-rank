export const adSlotsConfig = {
  // 기본 설정
  enabled: process.env.AD_SLOTS_ENABLED === 'true',
  
  // API 설정
  api: {
    port: parseInt(process.env.AD_SLOTS_API_PORT || '3002'),
  },
  
  // MySQL 연결 설정 (ad_slots 테이블용)
  mysql: {
    host: process.env.AD_SLOTS_MYSQL_HOST || '138.2.125.63',
    user: process.env.AD_SLOTS_MYSQL_USER || 'magic_dev',
    password: process.env.AD_SLOTS_MYSQL_PASSWORD || '',
    database: process.env.AD_SLOTS_MYSQL_DATABASE || 'magic_db',
    port: parseInt(process.env.AD_SLOTS_MYSQL_PORT || '3306'),
    connectionLimit: parseInt(process.env.AD_SLOTS_MYSQL_CONNECTION_LIMIT || '10'),
  },
  
  // 스케줄 및 수집 설정
  schedule: {
    cron: process.env.AD_SLOTS_SCHEDULE || '0 */6 * * *',  // 6시간마다
    batchSize: parseInt(process.env.AD_SLOTS_BATCH_SIZE || '100'),
    maxPages: parseInt(process.env.AD_SLOTS_MAX_PAGES || '3'),  // 3페이지(300위)까지
    delayBetweenKeywords: parseInt(process.env.AD_SLOTS_DELAY_BETWEEN_KEYWORDS || '100'),  // 0.1초
    delayBetweenPages: parseInt(process.env.AD_SLOTS_DELAY_BETWEEN_PAGES || '0'),  // 딜레이 없음
  },
  
  // Redis Queue 설정 (별도 DB 사용)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.AD_SLOTS_REDIS_DB || '2'),  // 기존은 0번 사용
  },
  
  // Queue 설정
  queue: {
    name: 'ad-slots-queue',
    concurrency: parseInt(process.env.AD_SLOTS_QUEUE_CONCURRENCY || '5'),
    maxRetries: parseInt(process.env.AD_SLOTS_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.AD_SLOTS_RETRY_DELAY || '60000'),  // 1분
  },
  
  // 로깅 설정
  logging: {
    level: process.env.AD_SLOTS_LOG_LEVEL || 'info',
    tableName: 'ad_slot_api_logs',
  },
};
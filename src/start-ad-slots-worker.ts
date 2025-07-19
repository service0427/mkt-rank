import dotenv from 'dotenv';
import cron from 'node-cron';
import { adSlotsConfig } from './config/ad-slots.config';
import { 
  initializeAdSlotsWorker, 
  enqueueAllActiveSlots, 
  cleanQueue,
  getQueueStatus 
} from './queues/ad-slots.queue';
import { closeMySQLPool } from './database/mysql.client';
import { pgPool } from './db/local-postgres';
import { logger } from './utils/logger';

// 환경변수 로드
dotenv.config();

// 프로세스 정보
const processInfo = {
  name: 'ad-slots-worker',
  version: process.env.npm_package_version || '1.0.0',
  nodeVersion: process.version,
  pid: process.pid,
  environment: process.env.NODE_ENV || 'development',
};

// Graceful shutdown
let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Received shutdown signal, starting graceful shutdown...');

  try {
    // Cron jobs 중지
    cron.getTasks().forEach(task => task.stop());

    // MySQL 연결 종료
    await closeMySQLPool();

    // PostgreSQL 연결 종료
    await pgPool.end();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// 시그널 핸들러
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 메인 함수
async function main() {
  try {
    logger.info('Starting AD_SLOTS Worker', processInfo);

    // AD_SLOTS 활성화 체크
    if (!adSlotsConfig.enabled) {
      logger.warn('AD_SLOTS_ENABLED is false. Exiting...');
      process.exit(0);
    }

    // Worker 초기화
    await initializeAdSlotsWorker();

    // 스케줄러 설정
    const schedule = adSlotsConfig.schedule.cron;
    logger.info(`Setting up scheduler with cron: ${schedule}`);

    // 메인 수집 스케줄
    cron.schedule(schedule, async () => {
      if (isShuttingDown) return;

      try {
        logger.info('Starting scheduled ad_slots collection');
        const result = await enqueueAllActiveSlots();
        logger.info('Scheduled collection enqueued', result);
      } catch (error) {
        logger.error('Failed to run scheduled collection:', error);
      }
    });

    // Queue 정리 스케줄 (매일 새벽 3시)
    cron.schedule('0 3 * * *', async () => {
      if (isShuttingDown) return;

      try {
        logger.info('Starting queue cleanup');
        await cleanQueue();
      } catch (error) {
        logger.error('Failed to clean queue:', error);
      }
    });

    // 상태 모니터링 (5분마다)
    cron.schedule('*/5 * * * *', async () => {
      if (isShuttingDown) return;

      try {
        const status = await getQueueStatus();
        logger.info('Queue status', status);
      } catch (error) {
        logger.error('Failed to get queue status:', error);
      }
    });

    // 시작 시 상태 출력
    const initialStatus = await getQueueStatus();
    logger.info('Initial queue status', initialStatus);

    logger.info('AD_SLOTS Worker started successfully');
    logger.info(`Schedule: ${schedule}`);
    logger.info(`Batch size: ${adSlotsConfig.schedule.batchSize}`);
    logger.info(`Max pages: ${adSlotsConfig.schedule.maxPages}`);
    logger.info(`Queue concurrency: ${adSlotsConfig.queue.concurrency}`);

    // 프로세스 유지
    setInterval(() => {
      // Keep process alive
    }, 1000);

  } catch (error) {
    logger.error('Failed to start AD_SLOTS Worker:', error);
    process.exit(1);
  }
}

// 에러 핸들러
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdown();
});

// 실행
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
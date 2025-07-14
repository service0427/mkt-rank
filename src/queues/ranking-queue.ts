import Bull from 'bull';
import { logger } from '../utils/logger';

export interface RankingJobData {
  keyword: string;
  priority: number;
  retryCount?: number;
  startedAt?: Date;
  type?: string; // 'shopping' | 'cp'
}

export const rankingQueue = new Bull<RankingJobData>('ranking-collection', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

rankingQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

rankingQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed for keyword ${job.data.keyword}:`, error);
});

rankingQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} completed for ${job.data.type || 'shopping'} keyword ${job.data.keyword}`);
});

export const addKeywordToQueue = async (keyword: string, priority: number = 0, type: string = 'shopping') => {
  try {
    const existingJobs = await rankingQueue.getJobs(['waiting', 'active']);
    const isDuplicate = existingJobs.some(job => 
      job.data.keyword === keyword && job.data.type === type
    );
    
    if (isDuplicate) {
      logger.warn(`${type} keyword ${keyword} is already in queue, skipping`);
      return null;
    }

    const job = await rankingQueue.add(
      {
        keyword,
        priority,
        startedAt: new Date(),
        type,
      },
      {
        priority,
        delay: 0,
      }
    );

    logger.info(`Added ${type} keyword ${keyword} to queue with priority ${priority}`);
    return job;
  } catch (error) {
    logger.error(`Failed to add keyword ${keyword} to queue:`, error);
    throw error;
  }
};

// 쿠팡 차단된 키워드를 재시도하기 위한 특별한 함수
export const addCoupangBlockedRetry = async (keyword: string, priority: number = 0, retryAttempt: number = 1) => {
  try {
    // 5-10분 랜덤 딜레이 (300,000ms - 600,000ms)
    const delayMs = 300000 + Math.floor(Math.random() * 300000);
    
    logger.info(`Adding Coupang blocked keyword ${keyword} to retry queue with ${delayMs}ms delay (attempt ${retryAttempt}/3)`);
    
    const job = await rankingQueue.add(
      {
        keyword,
        priority,
        startedAt: new Date(),
        type: 'cp',
        retryCount: retryAttempt,
      },
      {
        priority,
        delay: delayMs,
        attempts: 1, // 일반 재시도 비활성화 (수동으로 처리)
        backoff: {
          type: 'fixed',
          delay: 0,
        },
      }
    );

    return job;
  } catch (error) {
    logger.error(`Failed to add blocked Coupang keyword ${keyword} to retry queue:`, error);
    throw error;
  }
};

export const getQueueStatus = async () => {
  const waiting = await rankingQueue.getWaitingCount();
  const active = await rankingQueue.getActiveCount();
  const completed = await rankingQueue.getCompletedCount();
  const failed = await rankingQueue.getFailedCount();
  const delayed = await rankingQueue.getDelayedCount();

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
};

export const clearQueue = async () => {
  await rankingQueue.empty();
  await rankingQueue.clean(0, 'completed');
  await rankingQueue.clean(0, 'failed');
  logger.info('Queue cleared');
};
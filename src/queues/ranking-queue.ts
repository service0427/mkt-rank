import Bull from 'bull';
import { logger } from '../utils/logger';

export interface RankingJobData {
  keyword: string;
  priority: number;
  retryCount?: number;
  startedAt?: Date;
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
  logger.info(`Job ${job.id} completed for keyword ${job.data.keyword}`);
});

export const addKeywordToQueue = async (keyword: string, priority: number = 0) => {
  try {
    const existingJobs = await rankingQueue.getJobs(['waiting', 'active']);
    const isDuplicate = existingJobs.some(job => job.data.keyword === keyword);
    
    if (isDuplicate) {
      logger.warn(`Keyword ${keyword} is already in queue, skipping`);
      return null;
    }

    const job = await rankingQueue.add(
      {
        keyword,
        priority,
        startedAt: new Date(),
      },
      {
        priority,
        delay: 0,
      }
    );

    logger.info(`Added keyword ${keyword} to queue with priority ${priority}`);
    return job;
  } catch (error) {
    logger.error(`Failed to add keyword ${keyword} to queue:`, error);
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
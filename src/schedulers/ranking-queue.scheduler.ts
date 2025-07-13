import cron from 'node-cron';
import { KeywordService } from '../services/keyword/keyword.service';
import { addKeywordToQueue, getQueueStatus, clearQueue } from '../queues/ranking-queue';
import { RankingWorker } from '../workers/ranking-worker';
import { queueMonitor } from '../queues/queue-monitor';
import { logger } from '../utils/logger';
import { FileLogger } from '../utils/file-logger';
import { config } from '../config';
import { DatabaseCleanupService } from '../services/database/cleanup.service';

export class RankingQueueScheduler {
  private keywordService: KeywordService;
  private rankingWorker: RankingWorker;
  private fileLogger: FileLogger;
  private cleanupService: DatabaseCleanupService;
  private cronJob: cron.ScheduledTask | null = null;
  private cleanupCronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    this.keywordService = new KeywordService();
    this.rankingWorker = new RankingWorker();
    this.fileLogger = new FileLogger();
    this.cleanupService = new DatabaseCleanupService();
  }

  async start(): Promise<void> {
    if (this.cronJob) {
      logger.warn('Queue scheduler is already running');
      return;
    }

    await this.rankingWorker.start();
    logger.info('Ranking worker started');
    this.fileLogger.logSchedulerStart();

    logger.info(
      `Starting ranking queue scheduler with cron expression: ${config.scheduler.cronExpression}`
    );

    this.cronJob = cron.schedule(
      config.scheduler.cronExpression,
      async () => {
        await this.enqueueKeywords();
      },
      {
        scheduled: true,
        timezone: 'Asia/Seoul',
      }
    );

    logger.info('Ranking queue scheduler started successfully');

    // DB 정리 스케줄러 추가 (매일 새벽 3시)
    this.cleanupCronJob = cron.schedule(
      '0 3 * * *',
      async () => {
        logger.info('Running daily database cleanup');
        try {
          await this.cleanupService.runDailyCleanup();
        } catch (error) {
          logger.error('Database cleanup failed:', error);
        }
      },
      {
        scheduled: true,
        timezone: 'Asia/Seoul',
      }
    );

    logger.info('Database cleanup scheduler started (daily at 3 AM)');

    if (config.environment === 'development') {
      logger.info('Running initial queue population in development mode');
      this.enqueueKeywords().catch((error) => {
        logger.error('Initial queue population failed', { error });
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.cronJob) {
      logger.warn('Queue scheduler is not running');
      return;
    }

    this.cronJob.stop();
    this.cronJob = null;
    
    if (this.cleanupCronJob) {
      this.cleanupCronJob.stop();
      this.cleanupCronJob = null;
    }
    
    await this.rankingWorker.stop();
    
    logger.info('Ranking queue scheduler stopped');
  }

  async runManual(): Promise<void> {
    logger.info('Manual keyword enqueueing triggered');
    await this.enqueueKeywords();
  }

  private async enqueueKeywords(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Keyword enqueueing is already running, skipping this cycle');
      this.fileLogger.logSchedulerSkipped('Already running');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting keyword enqueueing');
      
      const queueStatus = await getQueueStatus();
      logger.info('Current queue status:', queueStatus);

      if (queueStatus.total > 50) {
        logger.warn(`Queue has ${queueStatus.total} pending jobs, skipping new additions`);
        this.fileLogger.logSchedulerSkipped(`Queue full: ${queueStatus.total} pending jobs`);
        return;
      }

      // 쇼핑 키워드 가져오기
      const shoppingKeywords = await this.keywordService.getActiveKeywords('shopping');
      logger.info(`Found ${shoppingKeywords.length} active shopping keywords to enqueue`);
      
      // 쿠팡 키워드 가져오기 (type='cp')
      const coupangKeywords = await this.keywordService.getActiveKeywords('cp');
      logger.info(`Found ${coupangKeywords.length} active coupang keywords to enqueue`);
      
      // 전체 키워드 합치기 (각 키워드에 type 추가)
      const keywords = [
        ...shoppingKeywords.map(k => ({...k, type: 'shopping'})),
        ...coupangKeywords.map(k => ({...k, type: 'cp'}))
      ];
      logger.info(`Total ${keywords.length} keywords to enqueue (shopping: ${shoppingKeywords.length}, coupang: ${coupangKeywords.length})`);
      
      // Queue에 추가하기 전에 전체 수집 시작 로그
      if (keywords.length > 0) {
        this.fileLogger.logCollectionStart(keywords.length);
        queueMonitor.startCollection(keywords.length);
      }

      let addedCount = 0;
      for (const keyword of keywords) {
        const priority = keyword.priority || 0;
        const job = await addKeywordToQueue(keyword.keyword, priority, keyword.type);
        if (job) {
          addedCount++;
        }
      }

      const enqueueDuration = Date.now() - startTime;
      logger.info(`Enqueued ${addedCount} keywords in ${enqueueDuration}ms`);
      
      // 주의: 여기서는 Queue에 추가만 했고, 실제 처리는 Worker에서 비동기로 진행됨
      // 따라서 여기서 COLLECTION_END를 기록하면 안됨

    } catch (error) {
      logger.error('Keyword enqueueing failed', {
        error,
        duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
      });
      this.fileLogger.logError(error, 'Keyword enqueueing');
    } finally {
      this.isRunning = false;
    }
  }

  async getStatus(): Promise<{
    isScheduled: boolean;
    isRunning: boolean;
    cronExpression: string;
    queueStatus: any;
    workerStatus: any;
    nextRun?: Date;
  }> {
    const queueStatus = await getQueueStatus();
    const workerStatus = await this.rankingWorker.getWorkerStatus();

    return {
      isScheduled: this.cronJob !== null,
      isRunning: this.isRunning,
      cronExpression: config.scheduler.cronExpression,
      queueStatus,
      workerStatus,
      nextRun: this.getNextRunTime(),
    };
  }

  private getNextRunTime(): Date | undefined {
    if (!this.cronJob) {
      return undefined;
    }

    const now = new Date();
    const [, hour] = config.scheduler.cronExpression.split(' ');
    
    if (hour.includes('*/')) {
      const interval = parseInt(hour.split('/')[1], 10);
      const nextHour = Math.ceil(now.getHours() / interval) * interval;
      const nextRun = new Date(now);
      nextRun.setHours(nextHour, 0, 0, 0);
      
      if (nextRun <= now) {
        nextRun.setHours(nextRun.getHours() + interval);
      }
      
      return nextRun;
    }

    return undefined;
  }

  async clearAllJobs(): Promise<void> {
    await clearQueue();
    logger.info('All jobs cleared from queue');
  }
}
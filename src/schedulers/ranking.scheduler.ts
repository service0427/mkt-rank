import cron from 'node-cron';
import { RankingService } from '../services/ranking/ranking.service';
import { logger } from '../utils/logger';
import { config } from '../config';

export class RankingScheduler {
  private rankingService: RankingService;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor() {
    this.rankingService = new RankingService();
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.cronJob) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info(
      `Starting ranking scheduler with cron expression: ${config.scheduler.cronExpression}`
    );

    this.cronJob = cron.schedule(
      config.scheduler.cronExpression,
      async () => {
        await this.runCollection();
      },
      {
        scheduled: true,
        timezone: 'Asia/Seoul', // Korean timezone
      }
    );

    logger.info('Ranking scheduler started successfully');

    // Run immediately on start if in development
    if (config.environment === 'development') {
      logger.info('Running initial collection in development mode');
      this.runCollection().catch((error) => {
        logger.error('Initial collection failed', { error });
      });
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.cronJob) {
      logger.warn('Scheduler is not running');
      return;
    }

    this.cronJob.stop();
    this.cronJob = null;
    logger.info('Ranking scheduler stopped');
  }

  /**
   * Run collection manually
   */
  async runManual(): Promise<void> {
    logger.info('Manual ranking collection triggered');
    await this.runCollection();
  }

  /**
   * Run the ranking collection process
   */
  private async runCollection(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Collection is already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting scheduled ranking collection');
      await this.rankingService.collectRankings();
      
      const duration = Date.now() - startTime;
      logger.info('Scheduled ranking collection completed', {
        duration: `${Math.round(duration / 1000)}s`,
      });
    } catch (error) {
      logger.error('Scheduled ranking collection failed', {
        error,
        duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isScheduled: boolean;
    isRunning: boolean;
    cronExpression: string;
    nextRun?: Date;
  } {
    return {
      isScheduled: this.cronJob !== null,
      isRunning: this.isRunning,
      cronExpression: config.scheduler.cronExpression,
      nextRun: this.getNextRunTime(),
    };
  }

  /**
   * Get next scheduled run time
   */
  private getNextRunTime(): Date | undefined {
    if (!this.cronJob) {
      return undefined;
    }

    // Parse cron expression to calculate next run
    // This is a simplified calculation
    const now = new Date();
    const [minute, hour] = config.scheduler.cronExpression.split(' ');
    
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
}
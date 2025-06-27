import { Job } from 'bull';
import { rankingQueue, RankingJobData } from '../queues/ranking-queue';
import { RankingService } from '../services/ranking/ranking.service';
import { KeywordService } from '../services/keyword/keyword.service';
import { logger } from '../utils/logger';
import { FileLogger } from '../utils/file-logger';
// Import to ensure queueMonitor singleton is initialized
import '../queues/queue-monitor';

export class RankingWorker {
  private rankingService: RankingService;
  private keywordService: KeywordService;
  private fileLogger: FileLogger;
  private concurrency: number;

  constructor() {
    this.rankingService = new RankingService();
    this.keywordService = new KeywordService();
    this.fileLogger = new FileLogger();
    this.concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '3');
  }

  async start() {
    logger.info(`Starting ranking worker with concurrency: ${this.concurrency}`);
    

    rankingQueue.process(this.concurrency, async (job: Job<RankingJobData>) => {
      const { keyword } = job.data;
      const startTime = Date.now();

      try {
        logger.info(`Processing keyword: ${keyword} (Job ID: ${job.id})`);
        
        await job.progress(10);
        
        const keywordData = await this.keywordService.getKeywordByName(keyword);
        if (!keywordData) {
          throw new Error(`Keyword not found: ${keyword}`);
        }

        await job.progress(20);

        // Convert KeywordService.Keyword to SearchKeyword format
        const searchKeyword = {
          id: keywordData.id,
          user_id: null,
          keyword: keywordData.keyword,
          pc_count: 0,
          mobile_count: 0,
          total_count: 0,
          pc_ratio: 0,
          mobile_ratio: 0,
          searched_at: keywordData.created_at,
        };
        
        await this.rankingService.collectKeywordRankings(searchKeyword);

        await job.progress(100);

        const duration = Date.now() - startTime;
        logger.info(`Completed keyword: ${keyword} in ${duration}ms`);
        this.fileLogger.logKeywordProcessed(keyword, true, duration);

        return {
          keyword,
          duration,
          success: true,
          completedAt: new Date(),
        };
      } catch (error) {
        logger.error(`Failed to process keyword ${keyword}:`, error);
        this.fileLogger.logKeywordProcessed(keyword, false, Date.now() - startTime);
        this.fileLogger.logError(error, `Processing keyword: ${keyword}`);
        throw error;
      }
    });

    rankingQueue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled for keyword ${job.data.keyword}`);
    });

    rankingQueue.on('progress', (job, progress) => {
      logger.debug(`Job ${job.id} progress: ${progress}%`);
    });

    // Queue 전체 이벤트 로깅
    rankingQueue.on('completed', (job, result) => {
      logger.info(`Queue job completed: ${job.data.keyword}`, result);
    });

    rankingQueue.on('failed', (job, err) => {
      logger.error(`Queue job failed: ${job.data.keyword}`, err);
    });
  }

  async stop() {
    await rankingQueue.close();
    logger.info('Ranking worker stopped');
  }

  async getWorkerStatus() {
    const queueStatus = await rankingQueue.getJobCounts();
    const workers = await rankingQueue.getWorkers();
    
    return {
      concurrency: this.concurrency,
      activeWorkers: workers.length,
      queue: queueStatus,
    };
  }
}
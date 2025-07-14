import { Job } from 'bull';
import { rankingQueue, RankingJobData, addCoupangBlockedRetry } from '../queues/ranking-queue';
import { RankingService } from '../services/ranking/ranking.service';
import { CoupangRankingService } from '../services/ranking/coupang-ranking.service';
import { KeywordService } from '../services/keyword/keyword.service';
import { logger } from '../utils/logger';
import { FileLogger } from '../utils/file-logger';
// Import to ensure queueMonitor singleton is initialized
import '../queues/queue-monitor';

export class RankingWorker {
  private rankingService: RankingService;
  private coupangRankingService: CoupangRankingService;
  private keywordService: KeywordService;
  private fileLogger: FileLogger;
  private concurrency: number;
  private coupangConcurrency: number;

  constructor() {
    this.rankingService = new RankingService();
    this.coupangRankingService = new CoupangRankingService();
    this.keywordService = new KeywordService();
    this.fileLogger = new FileLogger();
    this.concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '3');
    this.coupangConcurrency = parseInt(process.env.COUPANG_QUEUE_CONCURRENCY || '1');
  }

  async start() {
    logger.info(`Starting ranking worker with concurrency: ${this.concurrency} (shopping), ${this.coupangConcurrency} (coupang)`);
    
    // 쇼핑 키워드 처리
    rankingQueue.process('shopping', this.concurrency, async (job: Job<RankingJobData>) => {
      return await this.processJob(job);
    });

    // 쿠팡 키워드 처리 (별도 concurrency)
    rankingQueue.process('cp', this.coupangConcurrency, async (job: Job<RankingJobData>) => {
      return await this.processJob(job);
    });

    // 타입이 없는 경우 기본 처리
    rankingQueue.process('*', 1, async (job: Job<RankingJobData>) => {
      return await this.processJob(job);
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

  private async processJob(job: Job<RankingJobData>) {
    const { keyword, type = 'shopping' } = job.data;
    const startTime = Date.now();

    try {
        logger.info(`Processing ${type} keyword: ${keyword} (Job ID: ${job.id})`);
        
        await job.progress(10);
        
        const keywordData = await this.keywordService.getKeywordByNameAndType(keyword, type);
        if (!keywordData) {
          throw new Error(`Keyword not found: ${keyword} (type: ${type})`);
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
          type: type
        };
        
        // 타입에 따라 다른 서비스 호출
        if (type === 'cp') {
          await this.coupangRankingService.collectKeywordRankings(searchKeyword);
          
          // 쿠팡 API 호출 후 2-15초 랜덤 딜레이
          const delay = 2000 + Math.floor(Math.random() * 13000);
          logger.info(`Coupang API delay: ${delay}ms (${Math.round(delay/1000)}s) for keyword: ${keyword}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          await this.rankingService.collectKeywordRankings(searchKeyword);
        }

        await job.progress(100);

        const duration = Date.now() - startTime;
        logger.info(`Completed ${type} keyword: ${keyword} in ${duration}ms`);
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
        
        // 쿠팡 네트워크 차단 에러 처리
        const err = error as any;
        logger.info(`Error type: ${err.constructor?.name}, Error name: ${err.name}, Type: ${type}`);
        
        if (err.name === 'CoupangBlockedError' && type === 'cp') {
          const currentRetryCount = job.data.retryCount || 0;
          
          logger.info(`CoupangBlockedError detected for keyword ${keyword}, retryCount: ${currentRetryCount}`);
          
          if (currentRetryCount < 3) {
            logger.warn(`Coupang blocked for keyword ${keyword}, scheduling retry ${currentRetryCount + 1}/3`);
            
            // 재시도 작업 추가
            await addCoupangBlockedRetry(keyword, job.data.priority, currentRetryCount + 1);
            
            // 현재 작업은 성공으로 처리 (재시도 예약됨)
            return {
              keyword,
              duration: Date.now() - startTime,
              success: false,
              blockedRetry: currentRetryCount + 1,
              completedAt: new Date(),
            };
          } else {
            logger.error(`Coupang blocked for keyword ${keyword} - max retries (3) reached, giving up`);
          }
        }
        
        throw error;
      }
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
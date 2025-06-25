import { rankingQueue } from './ranking-queue';
import { FileLogger } from '../utils/file-logger';
import { logger } from '../utils/logger';

export class QueueMonitor {
  private fileLogger: FileLogger;
  private collectionStartTime: Date | null = null;
  private totalKeywords: number = 0;
  private completedKeywords: number = 0;
  private failedKeywords: number = 0;

  constructor() {
    this.fileLogger = new FileLogger();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // 수집 시작 시 호출
    rankingQueue.on('active', () => {
      if (this.collectionStartTime === null) {
        this.collectionStartTime = new Date();
      }
    });

    // 각 작업 완료 시
    rankingQueue.on('completed', (job) => {
      this.completedKeywords++;
      logger.info(`Keyword processed: ${job.data.keyword} (${this.completedKeywords}/${this.totalKeywords})`);
      
      // 모든 작업이 완료되었는지 확인
      this.checkCollectionComplete();
    });

    // 작업 실패 시
    rankingQueue.on('failed', (job) => {
      this.failedKeywords++;
      logger.error(`Keyword failed: ${job.data.keyword}`);
      
      // 모든 작업이 완료되었는지 확인
      this.checkCollectionComplete();
    });
  }

  startCollection(totalKeywords: number) {
    this.totalKeywords = totalKeywords;
    this.completedKeywords = 0;
    this.failedKeywords = 0;
    this.collectionStartTime = new Date();
    logger.info(`Starting collection monitoring for ${totalKeywords} keywords`);
  }

  private async checkCollectionComplete() {
    const processed = this.completedKeywords + this.failedKeywords;
    
    if (processed >= this.totalKeywords && this.totalKeywords > 0) {
      const queueStatus = await rankingQueue.getJobCounts();
      
      // Queue가 비어있는지 확인
      if (queueStatus.waiting === 0 && queueStatus.active === 0) {
        const duration = this.collectionStartTime 
          ? Date.now() - this.collectionStartTime.getTime()
          : 0;
          
        this.fileLogger.logCollectionEnd(
          this.completedKeywords,
          this.failedKeywords,
          duration
        );
        
        logger.info(`Collection completed: ${this.completedKeywords} success, ${this.failedKeywords} failed, duration: ${duration}ms`);
        
        // 초기화
        this.resetCounters();
      }
    }
  }

  private resetCounters() {
    this.totalKeywords = 0;
    this.completedKeywords = 0;
    this.failedKeywords = 0;
    this.collectionStartTime = null;
  }
}

// 싱글톤 인스턴스
export const queueMonitor = new QueueMonitor();
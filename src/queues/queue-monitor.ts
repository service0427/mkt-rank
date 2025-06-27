import { rankingQueue } from './ranking-queue';
import { FileLogger } from '../utils/file-logger';
import { logger } from '../utils/logger';
import { LocalPostgresService } from '../services/database/local-postgres.service';
import { SupabaseService } from '../services/database/supabase.service';
import { SimplifiedDataSyncService } from '../services/sync/data-sync-simplified.service';

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
    
    logger.info(`Checking collection complete: processed=${processed}, total=${this.totalKeywords}`);
    
    if (processed >= this.totalKeywords && this.totalKeywords > 0) {
      const queueStatus = await rankingQueue.getJobCounts();
      
      logger.info(`Queue status: waiting=${queueStatus.waiting}, active=${queueStatus.active}`);
      
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
        
        // 모든 키워드 수집이 완료되면 hourly sync 실행
        await this.runHourlySyncAfterCollection();
        
        // 초기화
        this.resetCounters();
      }
    }
  }

  private async runHourlySyncAfterCollection() {
    try {
      logger.info('Running hourly sync after all keywords collected...');
      
      const localDb = new LocalPostgresService();
      const supabase = new SupabaseService();
      const syncService = new SimplifiedDataSyncService(localDb, supabase);
      
      // Get active keywords
      const keywords = await supabase.getActiveKeywords();
      const keywordIds = keywords.map(k => k.id);
      
      if (keywordIds.length > 0) {
        logger.info(`Syncing hourly snapshots for ${keywordIds.length} keywords`);
        await syncService.syncHourlySnapshots(keywordIds);
        logger.info('Hourly sync completed successfully');
      }
      
      await localDb.cleanup();
    } catch (error) {
      logger.error('Failed to run hourly sync after collection:', error);
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
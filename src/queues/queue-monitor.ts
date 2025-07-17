import { rankingQueue } from './ranking-queue';
import { FileLogger } from '../utils/file-logger';
import { logger } from '../utils/logger';
import { LocalPostgresService } from '../services/database/local-postgres.service';
import { SupabaseService } from '../services/database/supabase.service';
import { SimplifiedDataSyncService } from '../services/sync/data-sync-simplified.service';
import { CoupangDataSyncService } from '../services/sync/coupang-data-sync.service';

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
    
    // 이미 처리된 경우 무시
    if (this.totalKeywords === 0) {
      return;
    }
    
    if (processed >= this.totalKeywords) {
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
        
        // 초기화 - 먼저 하여 재실행 방지
        this.resetCounters();
      }
    }
  }

  private async runHourlySyncAfterCollection() {
    try {
      logger.info('Running hourly sync after all keywords collected...');
      
      const localDb = new LocalPostgresService();
      const supabase = new SupabaseService();
      
      // Get all active keywords
      const allKeywords = await supabase.getActiveKeywords();
      
      // Separate keywords by type
      const shoppingKeywords = allKeywords.filter(k => k.type === 'shopping');
      const coupangKeywords = allKeywords.filter(k => k.type === 'cp');
      
      // Sync shopping keywords
      if (shoppingKeywords.length > 0) {
        const shoppingKeywordIds = shoppingKeywords.map(k => k.id);
        logger.info(`Syncing ${shoppingKeywordIds.length} shopping keywords...`);
        
        const shoppingSyncService = new SimplifiedDataSyncService(localDb, supabase);
        await shoppingSyncService.syncCurrentRankings(shoppingKeywordIds);
        await shoppingSyncService.syncHourlySnapshots(shoppingKeywordIds);
        
        // Daily sync at midnight (KST 00:00-00:05 = UTC 15:00-15:05)
        const now = new Date();
        if (now.getHours() === 15 && now.getMinutes() >= 0 && now.getMinutes() <= 5) {
          logger.info(`Daily sync check at ${now.toISOString()} (UTC ${now.getHours()}:${now.getMinutes()})`);
          await shoppingSyncService.syncDailySnapshots(shoppingKeywordIds);
        }
        
        logger.info('Shopping sync completed successfully');
      }
      
      // Sync coupang keywords
      if (coupangKeywords.length > 0) {
        const coupangKeywordIds = coupangKeywords.map(k => k.id);
        logger.info(`Syncing ${coupangKeywordIds.length} coupang keywords...`);
        
        const coupangSyncService = new CoupangDataSyncService(localDb, supabase);
        await coupangSyncService.syncCurrentRankings(coupangKeywordIds);
        await coupangSyncService.syncHourlySnapshots(coupangKeywordIds);
        
        // Daily sync at midnight (KST 00:00-00:05 = UTC 15:00-15:05)
        const now = new Date();
        if (now.getHours() === 15 && now.getMinutes() >= 0 && now.getMinutes() <= 5) {
          logger.info(`Daily sync check for Coupang at ${now.toISOString()} (UTC ${now.getHours()}:${now.getMinutes()})`);
          await coupangSyncService.syncDailySnapshots(coupangKeywordIds);
        }
        
        logger.info('Coupang sync completed successfully');
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
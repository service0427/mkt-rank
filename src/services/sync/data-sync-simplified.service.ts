import { LocalPostgresService } from '../database/local-postgres.service';
import { SupabaseService } from '../database/supabase.service';
import { logger } from '../../utils/logger';

export class SimplifiedDataSyncService {
  private localDb: LocalPostgresService;
  private supabase: SupabaseService;

  constructor(
    localDb: LocalPostgresService,
    supabase: SupabaseService
  ) {
    this.localDb = localDb;
    this.supabase = supabase;
  }

  /**
   * 현재 순위를 shopping_rankings_current 테이블에 동기화
   */
  async syncCurrentRankings(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting current rankings sync for ${keywordIds.length} keywords`);

      for (const keywordId of keywordIds) {
        // 로컬 DB에서 최신 순위 데이터 가져오기
        const latestRankings = await this.localDb.getRecentRankings(keywordId, 100);
        
        if (latestRankings.length === 0) {
          logger.warn(`No rankings found for keyword ${keywordId}`);
          continue;
        }

        // 이전 순위 정보 가져오기 (1시간 전 데이터)
        const prevRankings = await this.getPreviousRankings(keywordId);
        const prevRankMap = new Map(
          prevRankings.map(r => [r.product_id, r.rank])
        );

        // shopping_rankings_current 테이블 업데이트
        const { error } = await this.supabase.client
          .from('shopping_rankings_current')
          .upsert(
            latestRankings.map(ranking => ({
              keyword_id: ranking.keyword_id,
              product_id: ranking.product_id,
              rank: ranking.rank,
              prev_rank: prevRankMap.get(ranking.product_id) || null,
              title: ranking.title,
              lprice: ranking.lprice,
              image: ranking.image,
              mall_name: ranking.mall_name,
              brand: ranking.brand,
              category1: ranking.category1,
              category2: ranking.category2,
              link: ranking.link,
              collected_at: ranking.collected_at,
              updated_at: new Date().toISOString()
            })),
            { onConflict: 'keyword_id,product_id' }
          );

        if (error) {
          logger.error(`Failed to sync current rankings for keyword ${keywordId}:`, error);
        } else {
          logger.info(`Synced ${latestRankings.length} current rankings for keyword ${keywordId}`);
        }
      }

    } catch (error) {
      logger.error('Current rankings sync failed:', error);
      throw error;
    }
  }

  /**
   * 시간별 스냅샷을 shopping_rankings_hourly 테이블에 동기화
   */
  async syncHourlySnapshots(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting hourly snapshot sync for ${keywordIds.length} keywords`);

      const currentHour = new Date();
      currentHour.setMinutes(0, 0, 0);

      for (const keywordId of keywordIds) {
        // 현재 시간의 순위 데이터 가져오기
        const currentRankings = await this.localDb.getRecentRankings(keywordId, 100);
        
        if (currentRankings.length === 0) continue;

        // shopping_rankings_hourly 테이블에 저장
        const { error } = await this.supabase.client
          .from('shopping_rankings_hourly')
          .upsert(
            currentRankings.map(ranking => ({
              keyword_id: ranking.keyword_id,
              product_id: ranking.product_id,
              hour: currentHour.toISOString(),
              rank: ranking.rank,
              title: ranking.title,
              lprice: ranking.lprice,
              image: ranking.image,
              mall_name: ranking.mall_name,
              brand: ranking.brand,
              category1: ranking.category1,
              category2: ranking.category2,
              link: ranking.link,
              collected_at: ranking.collected_at
            })),
            { onConflict: 'keyword_id,product_id,hour' }
          );

        if (error) {
          logger.error(`Failed to sync hourly snapshot for keyword ${keywordId}:`, error);
        } else {
          logger.info(`Synced hourly snapshot for keyword ${keywordId}`);
        }
      }

      // 24시간 이상 된 데이터 정리
      await this.cleanupOldHourlyData();

    } catch (error) {
      logger.error('Hourly snapshot sync failed:', error);
      throw error;
    }
  }

  /**
   * 일별 스냅샷을 shopping_rankings_daily 테이블에 동기화
   * 매일 자정에 실행
   */
  async syncDailySnapshots(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting daily snapshot sync for ${keywordIds.length} keywords`);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);

      for (const keywordId of keywordIds) {
        // 어제의 마지막 시간(23시)의 hourly 데이터에서 가져오기
        const yesterdayLastHour = new Date();
        yesterdayLastHour.setDate(yesterdayLastHour.getDate() - 1);
        yesterdayLastHour.setHours(23, 0, 0, 0);
        
        const { data: yesterdayData } = await this.supabase.client
          .from('shopping_rankings_hourly')
          .select('*')
          .eq('keyword_id', keywordId)
          .eq('hour', yesterdayLastHour.toISOString())
          .order('rank', { ascending: true })
          .limit(100);

        if (!yesterdayData || yesterdayData.length === 0) {
          logger.warn(`No hourly data found for keyword ${keywordId} at ${yesterdayLastHour.toISOString()}`);
          continue;
        }

        // shopping_rankings_daily 테이블에 저장
        const { error } = await this.supabase.client
          .from('shopping_rankings_daily')
          .upsert(
            yesterdayData.map(ranking => ({
              keyword_id: ranking.keyword_id,
              product_id: ranking.product_id,
              date: yesterday.toISOString().split('T')[0],
              rank: ranking.rank,
              title: ranking.title,
              lprice: ranking.lprice,
              image: ranking.image,
              mall_name: ranking.mall_name,
              brand: ranking.brand,
              category1: ranking.category1,
              category2: ranking.category2,
              link: ranking.link,
              last_updated: new Date().toISOString()
            })),
            { onConflict: 'keyword_id,product_id,date' }
          );

        if (error) {
          logger.error(`Failed to sync daily snapshot for keyword ${keywordId}:`, error);
        } else {
          logger.info(`Synced daily snapshot for keyword ${keywordId}`);
        }
      }

      // 30일 이상 된 데이터 정리
      await this.cleanupOldDailyData();

    } catch (error) {
      logger.error('Daily snapshot sync failed:', error);
      throw error;
    }
  }

  /**
   * 이전 순위 정보 가져오기 (1시간 전)
   */
  private async getPreviousRankings(keywordId: string): Promise<any[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const { data } = await this.supabase.client
      .from('shopping_rankings_current')
      .select('product_id, rank')
      .eq('keyword_id', keywordId)
      .lte('collected_at', oneHourAgo.toISOString());

    return data || [];
  }

  /**
   * 24시간 이상 된 시간별 데이터 정리
   */
  private async cleanupOldHourlyData(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const { error } = await this.supabase.client
        .from('shopping_rankings_hourly')
        .delete()
        .lt('hour', cutoffTime.toISOString());

      if (error) {
        logger.error('Failed to cleanup old hourly data:', error);
      } else {
        logger.info('Cleaned up old hourly data');
      }
    } catch (error) {
      logger.error('Cleanup old hourly data failed:', error);
    }
  }

  /**
   * 30일 이상 된 일별 데이터 정리
   */
  private async cleanupOldDailyData(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const { error } = await this.supabase.client
        .from('shopping_rankings_daily')
        .delete()
        .lt('date', cutoffDate.toISOString().split('T')[0]);

      if (error) {
        logger.error('Failed to cleanup old daily data:', error);
      } else {
        logger.info('Cleaned up old daily data');
      }
    } catch (error) {
      logger.error('Cleanup old daily data failed:', error);
    }
  }

  /**
   * 전체 동기화 실행
   */
  async runFullSync(keywordIds: string[]): Promise<void> {
    try {
      logger.info('Starting full data sync');

      // 1. 현재 순위 동기화
      await this.syncCurrentRankings(keywordIds);

      // 2. 시간별 스냅샷 동기화 (정각인 경우)
      const now = new Date();
      if (now.getMinutes() === 0) {
        await this.syncHourlySnapshots(keywordIds);
      }

      // 3. 일별 스냅샷 동기화 (자정인 경우)
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        await this.syncDailySnapshots(keywordIds);
      }

      logger.info('Full data sync completed');
    } catch (error) {
      logger.error('Full data sync failed:', error);
      throw error;
    }
  }

  /**
   * 동기화 상태 기록
   */
  async logSyncStatus(
    syncType: string,
    status: 'running' | 'completed' | 'failed',
    recordsSynced?: number,
    error?: string
  ): Promise<void> {
    try {
      await this.supabase.client
        .from('sync_status')
        .insert({
          sync_type: syncType,
          status,
          records_synced: recordsSynced || 0,
          error_message: error,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      logger.error('Failed to log sync status:', err);
    }
  }
}
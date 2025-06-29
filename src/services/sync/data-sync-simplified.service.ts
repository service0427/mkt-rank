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

        // 이전 순위 정보 가져오기 (현재 저장된 데이터)
        const prevRankings = await this.getPreviousRankings(keywordId);
        const prevRankMap = new Map(
          prevRankings.map(r => [r.product_id, r.rank])
        );

        // 기존 데이터 삭제 (현재 순위 테이블은 최신 데이터만 유지)
        const { error: deleteError } = await this.supabase.client
          .from('shopping_rankings_current')
          .delete()
          .eq('keyword_id', keywordId);
          
        if (deleteError) {
          logger.error(`Failed to delete old rankings for keyword ${keywordId}:`, deleteError);
          continue;
        }

        // shopping_rankings_current 테이블에 새 데이터 삽입
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
          logger.info(`Deleted old and synced ${latestRankings.length} current rankings for keyword ${keywordId}`);
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
      
      logger.info(`Daily sync will save data for date: ${yesterday.toISOString().split('T')[0]}`);

      for (const keywordId of keywordIds) {
        // KST 기준 어제 23시 데이터를 찾기 위해 UTC 시간 계산
        const now = new Date();
        logger.info(`Current time: ${now.toISOString()}`);
        
        const yesterdayStart = new Date(now);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        yesterdayStart.setHours(13, 0, 0, 0);  // 어제 UTC 13시 = 어제 KST 22시
        
        const yesterdayEnd = new Date(now);
        yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
        yesterdayEnd.setHours(14, 59, 59, 999);  // 어제 UTC 14:59 = 어제 KST 23:59
        
        logger.info(`Date calculation - Yesterday start before: ${new Date(now).toISOString()}, after setDate(-1): ${yesterdayStart.toISOString()}`);
        logger.info(`Date calculation - Yesterday end before: ${new Date(now).toISOString()}, after setDate(-1): ${yesterdayEnd.toISOString()}`);
        
        logger.info(`Looking for hourly data for keyword ${keywordId} between ${yesterdayStart.toISOString()} and ${yesterdayEnd.toISOString()}`);
        
        const { data: yesterdayData, error: fetchError } = await this.supabase.client
          .from('shopping_rankings_hourly')
          .select('*')
          .eq('keyword_id', keywordId)
          .gte('hour', yesterdayStart.toISOString())
          .lte('hour', yesterdayEnd.toISOString())
          .order('hour', { ascending: false })
          .order('rank', { ascending: true })
          .limit(100);
          
        if (fetchError) {
          logger.error(`Error fetching hourly data: ${fetchError.message}`);
          continue;
        }

        if (!yesterdayData || yesterdayData.length === 0) {
          logger.warn(`No hourly data found for keyword ${keywordId} between ${yesterdayStart.toISOString()} and ${yesterdayEnd.toISOString()}`);
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
   * 이전 순위 정보 가져오기 (현재 저장된 데이터)
   */
  private async getPreviousRankings(keywordId: string): Promise<any[]> {
    // 현재 shopping_rankings_current에 있는 데이터가 이전 순위
    const { data } = await this.supabase.client
      .from('shopping_rankings_current')
      .select('product_id, rank')
      .eq('keyword_id', keywordId);

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

      // 2. 시간별 스냅샷 동기화는 queue-monitor에서 모든 수집 완료 후 실행
      // 개별 키워드 수집 시에는 실행하지 않음
      const now = new Date();
      logger.info(`Skipping hourly sync during individual collection at ${now.toISOString()}`);

      // 3. 일별 스냅샷 동기화 (KST 자정인 경우)
      // UTC 15시 = KST 00시
      if (now.getHours() === 15 && now.getMinutes() === 0) {
        logger.info('Running daily snapshot sync at KST midnight');
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
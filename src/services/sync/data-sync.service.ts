import { LocalPostgresService } from '../database/local-postgres.service';
import { SupabaseService } from '../database/supabase.service';
import { logger } from '../../utils/logger';

export class DataSyncService {
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
   * 최신 랭킹 데이터를 Supabase로 동기화
   * 각 키워드의 최신 100개 상품만 동기화
   */
  async syncLatestRankings(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting latest rankings sync for ${keywordIds.length} keywords`);

      for (const keywordId of keywordIds) {
        const latestRankings = await this.localDb.getRecentRankings(keywordId, 100);
        
        if (latestRankings.length === 0) {
          logger.warn(`No rankings found for keyword ${keywordId}`);
          continue;
        }

        // Supabase의 최신 랭킹 테이블 업데이트
        const { error } = await this.supabase.client
          .from('shopping_rankings_latest')
          .upsert(
            latestRankings.map(ranking => ({
              keyword_id: ranking.keyword_id,
              product_id: ranking.product_id,
              rank: ranking.rank,
              title: ranking.title,
              link: ranking.link,
              image: ranking.image,
              lprice: ranking.lprice,
              mall_name: ranking.mall_name,
              brand: ranking.brand,
              category1: ranking.category1,
              category2: ranking.category2,
              collected_at: ranking.collected_at
            })),
            { onConflict: 'keyword_id,product_id' }
          );

        if (error) {
          logger.error(`Failed to sync latest rankings for keyword ${keywordId}:`, error);
        } else {
          logger.info(`Synced ${latestRankings.length} latest rankings for keyword ${keywordId}`);
        }
      }

      // 키워드 통계 업데이트
      await this.updateKeywordStatistics(keywordIds);

    } catch (error) {
      logger.error('Latest rankings sync failed:', error);
      throw error;
    }
  }

  /**
   * 시간별 집계 데이터를 Supabase로 동기화
   */
  async syncHourlyAggregates(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting hourly aggregates sync for ${keywordIds.length} keywords`);

      // 먼저 로컬에서 시간별 집계 실행
      await this.localDb.runHourlyAggregation();

      for (const keywordId of keywordIds) {
        const hourlyData = await this.localDb.getHourlyAggregates(keywordId, 168); // 7일

        if (hourlyData.length === 0) continue;

        const { error } = await this.supabase.client
          .from('shopping_rankings_hourly_summary')
          .upsert(
            hourlyData.map(data => ({
              keyword_id: data.keyword_id,
              product_id: data.product_id,
              hour: data.hour,
              avg_rank: data.avg_rank,
              min_rank: data.min_rank,
              max_rank: data.max_rank,
              title: data.title,
              brand: data.brand
            })),
            { onConflict: 'keyword_id,product_id,hour' }
          );

        if (error) {
          logger.error(`Failed to sync hourly aggregates for keyword ${keywordId}:`, error);
        }
      }

      // 오래된 데이터 정리
      await this.cleanupOldSupabaseData();

    } catch (error) {
      logger.error('Hourly aggregates sync failed:', error);
      throw error;
    }
  }

  /**
   * 일별 집계 데이터를 Supabase로 동기화
   */
  async syncDailyAggregates(keywordIds: string[]): Promise<void> {
    try {
      logger.info(`Starting daily aggregates sync for ${keywordIds.length} keywords`);

      // 먼저 로컬에서 일별 집계 실행
      await this.localDb.runDailyAggregation();

      for (const keywordId of keywordIds) {
        const dailyData = await this.localDb.getDailyAggregates(keywordId, 30);

        if (dailyData.length === 0) continue;

        const { error } = await this.supabase.client
          .from('shopping_rankings_daily_summary')
          .upsert(
            dailyData.map(data => ({
              keyword_id: data.keyword_id,
              product_id: data.product_id,
              date: data.date,
              avg_rank: data.avg_rank,
              min_rank: data.min_rank,
              max_rank: data.max_rank,
              title: data.title,
              brand: data.brand
            })),
            { onConflict: 'keyword_id,product_id,date' }
          );

        if (error) {
          logger.error(`Failed to sync daily aggregates for keyword ${keywordId}:`, error);
        }
      }

      // 상위 제품 트렌드 업데이트
      await this.updateTopProductsTrend(keywordIds);

    } catch (error) {
      logger.error('Daily aggregates sync failed:', error);
      throw error;
    }
  }

  /**
   * 상위 제품 트렌드 업데이트
   */
  private async updateTopProductsTrend(keywordIds: string[]): Promise<void> {
    for (const keywordId of keywordIds) {
      try {
        // 최신 랭킹에서 상위 10개 제품 가져오기
        const { data: topProducts, error } = await this.supabase.client
          .from('shopping_rankings_latest')
          .select('*')
          .eq('keyword_id', keywordId)
          .order('rank', { ascending: true })
          .limit(10);

        if (error || !topProducts) continue;

        // 각 제품의 트렌드 계산
        for (const product of topProducts) {
          // 7일 평균 계산
          const { data: weeklyData } = await this.supabase.client
            .from('shopping_rankings_daily_summary')
            .select('avg_rank')
            .eq('keyword_id', keywordId)
            .eq('product_id', product.product_id)
            .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('date', { ascending: false });

          const avg7d = weeklyData && weeklyData.length > 0
            ? weeklyData.reduce((sum, d) => sum + parseFloat(d.avg_rank), 0) / weeklyData.length
            : null;

          // 30일 평균 계산
          const { data: monthlyData } = await this.supabase.client
            .from('shopping_rankings_daily_summary')
            .select('avg_rank')
            .eq('keyword_id', keywordId)
            .eq('product_id', product.product_id)
            .order('date', { ascending: false })
            .limit(30);

          const avg30d = monthlyData && monthlyData.length > 0
            ? monthlyData.reduce((sum, d) => sum + parseFloat(d.avg_rank), 0) / monthlyData.length
            : null;

          // 이전 순위 가져오기 (24시간 전)
          const { data: prevRankData } = await this.supabase.client
            .from('shopping_rankings_hourly_summary')
            .select('avg_rank')
            .eq('keyword_id', keywordId)
            .eq('product_id', product.product_id)
            .lte('hour', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('hour', { ascending: false })
            .limit(1);

          const prevRank = prevRankData && prevRankData.length > 0
            ? Math.round(parseFloat(prevRankData[0].avg_rank))
            : null;

          // 트렌드 업데이트
          await this.supabase.client
            .from('top_products_trend')
            .upsert({
              keyword_id: keywordId,
              product_id: product.product_id,
              title: product.title,
              brand: product.brand,
              current_rank: product.rank,
              prev_rank: prevRank,
              rank_change: prevRank ? product.rank - prevRank : null,
              avg_rank_7d: avg7d,
              avg_rank_30d: avg30d,
              last_seen_at: product.collected_at,
              updated_at: new Date().toISOString()
            }, { onConflict: 'keyword_id,product_id' });
        }
      } catch (error) {
        logger.error(`Failed to update top products trend for keyword ${keywordId}:`, error);
      }
    }
  }

  /**
   * 키워드 통계 업데이트
   */
  private async updateKeywordStatistics(keywordIds: string[]): Promise<void> {
    for (const keywordId of keywordIds) {
      try {
        const { data: latestData } = await this.supabase.client
          .from('shopping_rankings_latest')
          .select('lprice, collected_at')
          .eq('keyword_id', keywordId);

        if (!latestData || latestData.length === 0) continue;

        const prices = latestData.map(d => d.lprice).filter(p => p > 0);
        const avgPrice = prices.length > 0 
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : 0;

        await this.supabase.client
          .from('keyword_statistics')
          .upsert({
            keyword_id: keywordId,
            total_products: latestData.length,
            unique_products_24h: latestData.length,
            avg_price: avgPrice,
            min_price: Math.min(...prices),
            max_price: Math.max(...prices),
            last_collected_at: latestData[0].collected_at,
            updated_at: new Date().toISOString()
          }, { onConflict: 'keyword_id' });

      } catch (error) {
        logger.error(`Failed to update statistics for keyword ${keywordId}:`, error);
      }
    }
  }

  /**
   * Supabase의 오래된 데이터 정리
   */
  private async cleanupOldSupabaseData(): Promise<void> {
    try {
      await this.supabase.client.rpc('cleanup_old_supabase_data');
      logger.info('Cleaned up old Supabase data');
    } catch (error) {
      logger.error('Failed to cleanup old Supabase data:', error);
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
        .from('supabase_sync_status')
        .insert({
          sync_type: syncType,
          last_synced_at: new Date().toISOString(),
          status,
          records_synced: recordsSynced || 0,
          error_message: error
        });
    } catch (err) {
      logger.error('Failed to log sync status:', err);
    }
  }
}
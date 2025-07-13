import { LocalPostgresService } from '../database/local-postgres.service';
import { SupabaseService } from '../database/supabase.service';
import { logger } from '../../utils/logger';

interface CoupangRankingRecord {
  keyword_id: string;
  product_id: string;
  rank: number;
  title: string;
  link: string;
  image: string;
  lprice: number;
  hprice: number;
  mall_name: string;
  product_type: number;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
  seller_name?: string;
  is_rocket: boolean;
  is_rocket_fresh?: boolean;
  is_rocket_global?: boolean;
  delivery_type?: string;
  rating?: number;
  review_count?: number;
  is_wow_deal?: boolean;
  discount_rate?: number;
  original_price?: number;
  card_discount?: number;
  collected_at: Date;
}

export class CoupangDataSyncService {
  constructor(
    private localDb: LocalPostgresService,
    private supabase: SupabaseService
  ) {}

  /**
   * 전체 동기화 실행
   */
  async runFullSync(keywordIds?: string[]): Promise<void> {
    logger.info('Starting Coupang full data sync');
    const startTime = Date.now();

    try {
      // 1. 현재 랭킹 동기화
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

      const duration = Date.now() - startTime;
      logger.info(`Coupang full sync completed in ${duration}ms`);
    } catch (error) {
      logger.error('Coupang full sync failed:', error);
      throw error;
    }
  }

  /**
   * 현재 랭킹 동기화 (cp_rankings_current)
   */
  async syncCurrentRankings(keywordIds?: string[]): Promise<void> {
    logger.info('Syncing Coupang current rankings to Supabase');

    try {
      // 로컬에서 최신 랭킹 가져오기
      const rankings = await this.getLatestCoupangRankings(keywordIds);
      
      if (rankings.length === 0) {
        logger.info('No Coupang rankings to sync');
        return;
      }

      // 키워드별로 그룹화
      const rankingsByKeyword = this.groupByKeyword(rankings);

      // 각 키워드에 대해 동기화
      for (const [keywordId, keywordRankings] of Object.entries(rankingsByKeyword)) {
        await this.syncKeywordCurrentRankings(keywordId, keywordRankings);
      }

      logger.info(`Synced ${rankings.length} Coupang current rankings for ${Object.keys(rankingsByKeyword).length} keywords`);
    } catch (error) {
      logger.error('Failed to sync Coupang current rankings:', error);
      throw error;
    }
  }

  /**
   * 시간별 스냅샷 동기화 (cp_rankings_hourly)
   */
  async syncHourlySnapshots(keywordIds?: string[]): Promise<void> {
    logger.info('Syncing Coupang hourly snapshots to Supabase');

    try {
      const hourlyData = await this.getHourlyCoupangAggregates(keywordIds);
      
      if (hourlyData.length === 0) {
        logger.info('No Coupang hourly data to sync');
        return;
      }

      // Supabase에 일괄 삽입
      const { error } = await this.supabase.client
        .from('cp_rankings_hourly')
        .upsert(hourlyData.map(data => ({
          keyword_id: data.keyword_id,
          product_id: data.product_id,
          hour: data.hour,
          rank: data.rank,
          title: data.title,
          lprice: data.lprice,
          hprice: data.hprice,
          image: data.image,
          mall_name: data.mall_name,
          brand: data.brand,
          category1: data.category1,
          category2: data.category2,
          category3: data.category3,
          category4: data.category4,
          link: data.link,
          seller_name: data.seller_name,
          is_rocket: data.is_rocket,
          is_rocket_fresh: data.is_rocket_fresh,
          is_rocket_global: data.is_rocket_global,
          delivery_type: data.delivery_type,
          rating: data.rating,
          review_count: data.review_count,
          is_wow_deal: data.is_wow_deal,
          discount_rate: data.discount_rate,
          original_price: data.original_price,
          card_discount: data.card_discount,
          collected_at: data.collected_at
        })), {
          onConflict: 'keyword_id,product_id,hour',
          ignoreDuplicates: false
        });

      if (error) {
        throw error;
      }

      logger.info(`Synced ${hourlyData.length} Coupang hourly snapshots`);
    } catch (error) {
      logger.error('Failed to sync Coupang hourly snapshots:', error);
      throw error;
    }
  }

  /**
   * 일별 스냅샷 동기화 (cp_rankings_daily)
   */
  async syncDailySnapshots(keywordIds?: string[]): Promise<void> {
    logger.info('Syncing Coupang daily snapshots to Supabase');

    try {
      const dailyData = await this.getDailyCoupangAggregates(keywordIds);
      
      if (dailyData.length === 0) {
        logger.info('No Coupang daily data to sync');
        return;
      }

      // Supabase에 일괄 삽입
      const { error } = await this.supabase.client
        .from('cp_rankings_daily')
        .upsert(dailyData, {
          onConflict: 'keyword_id,product_id,date',
          ignoreDuplicates: false
        });

      if (error) {
        throw error;
      }

      logger.info(`Synced ${dailyData.length} Coupang daily snapshots`);
    } catch (error) {
      logger.error('Failed to sync Coupang daily snapshots:', error);
      throw error;
    }
  }

  /**
   * 단일 키워드의 현재 랭킹 동기화
   */
  private async syncKeywordCurrentRankings(
    keywordId: string,
    rankings: CoupangRankingRecord[]
  ): Promise<void> {
    try {
      // 기존 데이터 삭제
      const { error: deleteError } = await this.supabase.client
        .from('cp_rankings_current')
        .delete()
        .eq('keyword_id', keywordId);

      if (deleteError) {
        throw deleteError;
      }

      // 새 데이터 삽입
      const dataToInsert = rankings.map(ranking => ({
        keyword_id: ranking.keyword_id,
        product_id: ranking.product_id,
        rank: ranking.rank,
        title: ranking.title,
        link: ranking.link,
        image: ranking.image,
        lprice: ranking.lprice,
        hprice: ranking.hprice,
        mall_name: ranking.mall_name,
        brand: ranking.brand,
        category1: ranking.category1,
        category2: ranking.category2,
        category3: ranking.category3,
        category4: ranking.category4,
        seller_name: ranking.seller_name,
        is_rocket: ranking.is_rocket,
        is_rocket_fresh: ranking.is_rocket_fresh,
        is_rocket_global: ranking.is_rocket_global,
        delivery_type: ranking.delivery_type,
        rating: ranking.rating,
        review_count: ranking.review_count,
        is_wow_deal: ranking.is_wow_deal,
        discount_rate: ranking.discount_rate,
        original_price: ranking.original_price,
        card_discount: ranking.card_discount,
        collected_at: ranking.collected_at
      }));

      const { error: insertError } = await this.supabase.client
        .from('cp_rankings_current')
        .upsert(dataToInsert, {
          onConflict: 'keyword_id,product_id',
          ignoreDuplicates: false
        });

      if (insertError) {
        throw insertError;
      }
    } catch (error) {
      logger.error(`Failed to sync current rankings for keyword ${keywordId}:`, error);
      throw error;
    }
  }

  /**
   * 로컬 DB에서 최신 쿠팡 랭킹 가져오기
   */
  private async getLatestCoupangRankings(keywordIds?: string[]): Promise<CoupangRankingRecord[]> {
    let query = `
      WITH latest_collections AS (
        SELECT keyword_id, MAX(collected_at) as max_collected_at
        FROM cp_rankings
        ${keywordIds ? 'WHERE keyword_id = ANY($1)' : ''}
        GROUP BY keyword_id
      )
      SELECT r.*
      FROM cp_rankings r
      INNER JOIN latest_collections lc
        ON r.keyword_id = lc.keyword_id
        AND r.collected_at = lc.max_collected_at
      ORDER BY r.keyword_id, r.rank
    `;

    const params = keywordIds ? [keywordIds] : [];
    const result = await this.localDb.pool.query(query, params);
    return result.rows;
  }

  /**
   * 로컬 DB에서 시간별 데이터 가져오기 (집계하지 않고 원본 데이터)
   */
  private async getHourlyCoupangAggregates(keywordIds?: string[]): Promise<any[]> {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);

    let query = `
      WITH latest_hour_data AS (
        SELECT DISTINCT ON (keyword_id, product_id)
          keyword_id,
          product_id,
          rank,
          title,
          lprice,
          hprice,
          image,
          mall_name,
          brand,
          category1,
          category2,
          category3,
          category4,
          link,
          seller_name,
          is_rocket,
          is_rocket_fresh,
          is_rocket_global,
          delivery_type,
          rating,
          review_count,
          is_wow_deal,
          discount_rate,
          original_price,
          card_discount,
          date_trunc('hour', collected_at) as hour,
          collected_at
        FROM cp_rankings
        WHERE date_trunc('hour', collected_at) = $1
          ${keywordIds ? 'AND keyword_id = ANY($2)' : ''}
        ORDER BY keyword_id, product_id, collected_at DESC
      )
      SELECT * FROM latest_hour_data
    `;

    const params = keywordIds ? [currentHour, keywordIds] : [currentHour];
    const result = await this.localDb.pool.query(query, params);
    return result.rows;
  }

  /**
   * 로컬 DB에서 일별 집계 데이터 가져오기
   */
  private async getDailyCoupangAggregates(keywordIds?: string[]): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = `
      SELECT 
        keyword_id,
        product_id,
        date_trunc('day', collected_at)::date as date,
        MIN(rank) as best_rank,
        MAX(rank) as worst_rank,
        AVG(rank)::numeric(10,2) as avg_rank,
        COUNT(*) as count,
        MIN(lprice) as min_price,
        MAX(lprice) as max_price,
        AVG(lprice)::numeric(10,2) as avg_price,
        MAX(CASE WHEN is_rocket THEN 1 ELSE 0 END)::boolean as is_rocket,
        AVG(rating)::numeric(3,2) as avg_rating,
        AVG(review_count)::integer as avg_review_count,
        AVG(discount_rate)::numeric(5,2) as avg_discount_rate
      FROM cp_rankings
      WHERE date_trunc('day', collected_at) = $1
        ${keywordIds ? 'AND keyword_id = ANY($2)' : ''}
      GROUP BY keyword_id, product_id, date
    `;

    const params = keywordIds ? [today, keywordIds] : [today];
    const result = await this.localDb.pool.query(query, params);
    return result.rows;
  }

  /**
   * 랭킹을 키워드별로 그룹화
   */
  private groupByKeyword(rankings: CoupangRankingRecord[]): Record<string, CoupangRankingRecord[]> {
    return rankings.reduce((acc, ranking) => {
      if (!acc[ranking.keyword_id]) {
        acc[ranking.keyword_id] = [];
      }
      acc[ranking.keyword_id].push(ranking);
      return acc;
    }, {} as Record<string, CoupangRankingRecord[]>);
  }

  /**
   * 동기화 상태 확인
   */
  async checkSyncStatus(): Promise<{
    currentCount: number;
    hourlyCount: number;
    dailyCount: number;
    lastSyncTime: Date | null;
  }> {
    try {
      // 현재 랭킹 수
      const currentResult = await this.supabase.client
        .from('cp_rankings_current')
        .select('keyword_id', { count: 'exact' });

      // 시간별 데이터 수
      const hourlyResult = await this.supabase.client
        .from('cp_rankings_hourly')
        .select('keyword_id', { count: 'exact' });

      // 일별 데이터 수
      const dailyResult = await this.supabase.client
        .from('cp_rankings_daily')
        .select('keyword_id', { count: 'exact' });

      return {
        currentCount: currentResult.count || 0,
        hourlyCount: hourlyResult.count || 0,
        dailyCount: dailyResult.count || 0,
        lastSyncTime: new Date()
      };
    } catch (error) {
      logger.error('Failed to check Coupang sync status:', error);
      throw error;
    }
  }
}
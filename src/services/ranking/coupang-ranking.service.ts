import { SupabaseService } from '../database/supabase.service';
import { LocalPostgresService } from '../database/local-postgres.service';
import { CoupangDataSyncService } from '../sync/coupang-data-sync.service';
import { CoupangProvider } from '../../providers/coupang.provider';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { Keyword, SearchResult } from '../../types';

interface CoupangRanking {
  keyword_id: string;
  keyword_name: string;
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
  // 쿠팡 특화 필드
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

export class CoupangRankingService {
  private supabaseService: SupabaseService;
  private localDbService: LocalPostgresService;
  private dataSyncService: CoupangDataSyncService;
  private searchProvider: CoupangProvider;

  constructor() {
    this.supabaseService = new SupabaseService();
    this.localDbService = new LocalPostgresService();
    this.dataSyncService = new CoupangDataSyncService(this.localDbService, this.supabaseService);
    this.searchProvider = new CoupangProvider();
  }

  /**
   * 모든 활성 쿠팡 키워드의 랭킹 수집
   */
  async collectRankings(): Promise<void> {
    logger.info('Starting Coupang ranking collection process');
    const startTime = Date.now();

    try {
      // type='cp'인 활성 키워드 가져오기
      const keywords = await this.supabaseService.getActiveKeywords(100, 'cp');
      
      if (keywords.length === 0) {
        logger.warn('No active Coupang keywords found');
        return;
      }

      logger.info(`Found ${keywords.length} active Coupang keywords to process`);

      // 각 키워드 처리
      let successCount = 0;
      let errorCount = 0;

      for (const keyword of keywords) {
        try {
          await this.collectKeywordRankings(keyword);
          successCount++;
          
          // API 속도 제한 방지를 위한 딜레이
          await this.sleep(1000);
        } catch (error) {
          errorCount++;
          logger.error(`Failed to collect Coupang rankings for keyword: ${keyword.keyword}`, {
            error,
            keywordId: keyword.id,
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Coupang ranking collection completed', {
        duration: `${duration}ms`,
        totalKeywords: keywords.length,
        successCount,
        errorCount,
      });

      // Supabase로 동기화 - queue-monitor에서 처리하므로 여기서는 실행하지 않음
      logger.info('Individual keyword collection completed. Sync will be handled by queue-monitor.');
    } catch (error) {
      logger.error('Coupang ranking collection process failed', { error });
      throw error;
    }
  }

  /**
   * 단일 키워드의 쿠팡 랭킹 수집
   */
  public async collectKeywordRankings(keyword: Keyword): Promise<void> {
    logger.info(`Collecting Coupang rankings for keyword: ${keyword.keyword}`);
    const collectedAt = new Date();
    const allResults: SearchResult[] = [];

    try {
      // 첫 페이지 가져오기
      const firstPage = await this.fetchPageWithMetrics(keyword, 1);
      allResults.push(...firstPage.results);

      // 결과가 없으면 로그만 남기고 종료
      if (firstPage.totalCount === 0) {
        logger.warn(`No results found for Coupang keyword: ${keyword.keyword}`);
        return;
      }

      // 총 페이지 수 계산 (쿠팡은 페이지당 100개)
      const itemsPerPage = 100;
      const totalPages = Math.min(
        Math.ceil(firstPage.totalCount / itemsPerPage),
        config.search.maxPages || 10
      );

      logger.debug(`Total pages to fetch from Coupang: ${totalPages} for keyword: ${keyword.keyword}`);

      // 나머지 페이지 가져오기
      for (let page = 2; page <= totalPages; page++) {
        const pageResults = await this.fetchPageWithMetrics(keyword, page);
        allResults.push(...pageResults.results);
        
        // 페이지 간 딜레이
        await this.sleep(500);
      }

      // 로컬 데이터베이스용 랭킹 준비
      const rankings: CoupangRanking[] = allResults.map((result, index) => ({
        keyword_id: keyword.id,
        keyword_name: keyword.keyword,
        product_id: result.productId,
        rank: index + 1,
        title: result.title,
        link: result.link,
        image: result.image,
        lprice: result.lprice,
        hprice: 0,  // 쿠팡은 hprice 사용하지 않음
        mall_name: result.mallName,
        product_type: parseInt(result.productType) || 1,
        brand: result.brand || '',
        maker: result.maker || '',
        category1: result.category1,
        category2: result.category2,
        category3: result.category3,
        category4: result.category4,
        // 쿠팡 특화 필드
        is_rocket: result.metadata?.isRocket || false,
        is_rocket_fresh: result.metadata?.isRocketFresh,
        is_rocket_global: result.metadata?.isRocketGlobal,
        delivery_type: result.metadata?.deliveryInfo,
        rating: result.metadata?.ratingScore,
        review_count: result.metadata?.ratingCount,
        discount_rate: result.metadata?.discountRate,
        collected_at: collectedAt,
      }));

      // 로컬 PostgreSQL에 먼저 저장
      await this.saveCoupangRankings(rankings);
      
      // 전체 동기화 실행 (현재 랭킹만 동기화, 시간별/일별은 queue-monitor에서 처리)
      await this.dataSyncService.runFullSync([keyword.id]);
      
      // Supabase에 마지막 수집 시간 업데이트
      await this.supabaseService.updateKeywordLastCollected(keyword.id);

      logger.info(`Successfully collected ${allResults.length} Coupang rankings for keyword: ${keyword.keyword}`);
    } catch (error) {
      logger.error(`Failed to collect Coupang rankings for keyword: ${keyword.keyword}`, {
        error,
        keywordId: keyword.id,
      });
      throw error;
    }
  }

  /**
   * API 사용량 추적과 함께 페이지 가져오기
   */
  private async fetchPageWithMetrics(
    keyword: Keyword,
    page: number
  ): Promise<{ results: SearchResult[]; totalCount: number }> {
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | undefined;

    try {
      const response = await this.searchProvider.search(keyword.keyword, page);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Search failed');
      }
      
      return {
        results: response.results,
        totalCount: response.totalCount
      };
    } catch (error: any) {
      success = false;
      errorMessage = error.message;
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;

      // API 사용량 로깅
      await this.supabaseService.logApiUsage({
        provider: 'coupang',
        endpoint: 'search',
        keyword_id: keyword.id,
        request_count: 1,
        response_time_ms: responseTime,
        success,
        error_message: errorMessage,
      });
    }
  }

  /**
   * 쿠팡 랭킹을 로컬 DB에 저장
   */
  private async saveCoupangRankings(rankings: CoupangRanking[]): Promise<void> {
    // rankings가 비어있으면 로그만 남기고 리턴
    if (rankings.length === 0) {
      logger.warn('No Coupang rankings to save');
      return;
    }

    const client = await this.localDbService.pool.connect();
    try {
      await client.query('BEGIN');

      // 배치 삽입을 위한 쿼리 준비
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      rankings.forEach((ranking) => {
        const placeholder = `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`;
        placeholders.push(placeholder);

        values.push(
          ranking.keyword_id,
          ranking.keyword_name,
          ranking.product_id,
          ranking.rank,
          ranking.title,
          ranking.link,
          ranking.image,
          ranking.lprice,
          0,  // hprice는 0으로 처리
          ranking.mall_name,
          ranking.brand,
          ranking.maker || '',
          ranking.category1,
          ranking.category2,
          ranking.category3 || '',
          ranking.category4 || '',
          ranking.seller_name || '',
          ranking.delivery_type || '',
          ranking.is_rocket || false,
          ranking.is_rocket_fresh || false,
          ranking.is_rocket_global || false,
          ranking.rating || null,
          ranking.review_count || 0,
          ranking.is_wow_deal || false,
          ranking.discount_rate || null,
          ranking.original_price || null,
          ranking.card_discount || null,
          ranking.collected_at
        );
      });

      const query = `
        INSERT INTO cp_rankings (
          keyword_id, keyword_name, product_id, rank, title, link, image,
          lprice, hprice, mall_name, brand, maker,
          category1, category2, category3, category4,
          seller_name, delivery_type,
          is_rocket, is_rocket_fresh, is_rocket_global,
          rating, review_count, is_wow_deal, discount_rate, original_price,
          card_discount, collected_at
        ) VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      await client.query('COMMIT');

      logger.info(`Saved ${rankings.length} Coupang rankings to local PostgreSQL`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save Coupang rankings to local PostgreSQL:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 데이터베이스 통계 가져오기
   */
  async getStatistics(): Promise<any> {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT keyword_id) as total_keywords,
          COUNT(*) as total_rankings,
          COUNT(DISTINCT product_id) as unique_products,
          AVG(CASE WHEN is_rocket THEN 1 ELSE 0 END) * 100 as rocket_percentage,
          AVG(rating) as avg_rating,
          MAX(collected_at) as last_collected
        FROM cp_rankings
        WHERE collected_at > NOW() - INTERVAL '24 hours'
      `;

      const result = await this.localDbService.pool.query(query);
      return {
        coupang: result.rows[0],
        lastSync: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get Coupang statistics:', error);
      throw error;
    }
  }

  /**
   * 로켓배송 상품만 수집
   */
  async collectRocketDeliveryOnly(keyword: string, page: number = 1): Promise<void> {
    try {
      const response = await this.searchProvider.searchRocketDelivery(keyword, page);
      logger.info(`Collected ${response.results.length} rocket delivery products for keyword: ${keyword}`);
    } catch (error) {
      logger.error('Failed to collect rocket delivery products:', error);
      throw error;
    }
  }

  /**
   * Sleep 헬퍼
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
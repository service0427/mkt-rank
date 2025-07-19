import { Pool } from 'pg';
import { AdSlot, AdSlotRanking, RankingUpdateResult } from '../../types/ad-slots.types';
import { SearchResult } from '../../types';
import { NaverShoppingProvider } from '../../providers/naver-shopping.provider';
import { ApiKeyManagerFactory } from '../../factory/api-key-manager.factory';
import { logger } from '../../utils/logger';
import { adSlotsConfig } from '../../config/ad-slots.config';
import { pgPool } from '../../db/local-postgres';

export class AdSlotRankingService {
  private searchProvider: NaverShoppingProvider | null = null;
  private localDbPool: Pool;

  constructor() {
    this.localDbPool = pgPool;
  }

  /**
   * 서비스 초기화
   */
  async initialize(): Promise<void> {
    try {
      const apiKeyManager = await ApiKeyManagerFactory.getNaverShoppingManagerWithFallback();
      this.searchProvider = new NaverShoppingProvider(apiKeyManager as any);
      logger.info('AdSlotRankingService initialized');
    } catch (error) {
      logger.error('Failed to initialize AdSlotRankingService:', error);
      throw error;
    }
  }

  /**
   * 단일 슬롯의 순위 수집
   */
  async collectSingleSlotRanking(adSlot: AdSlot): Promise<RankingUpdateResult> {
    if (!this.searchProvider) {
      throw new Error('Search provider not initialized');
    }

    const startTime = Date.now();
    const result: RankingUpdateResult = {
      ad_slot_id: adSlot.ad_slot_id,
      work_keyword: adSlot.work_keyword || '',
      is_found: false,
    };

    try {
      if (!adSlot.work_keyword) {
        throw new Error('No work_keyword provided');
      }

      logger.info(`Collecting rankings for ad_slot ${adSlot.ad_slot_id}, keyword: ${adSlot.work_keyword}`);

      const allResults: SearchResult[] = [];
      
      // 3페이지까지 검색
      for (let page = 1; page <= adSlotsConfig.schedule.maxPages; page++) {
        logger.debug(`Searching page ${page} for keyword: ${adSlot.work_keyword}`);
        
        const searchResponse = await this.searchProvider.search(adSlot.work_keyword, page);
        allResults.push(...searchResponse.results);

        // API 사용 로그
        await this.logApiUsage(adSlot.ad_slot_id, adSlot.work_keyword, page, Date.now() - startTime, 'success');

        // 페이지 간 딜레이
        if (page < adSlotsConfig.schedule.maxPages) {
          await this.sleep(adSlotsConfig.schedule.delayBetweenPages);
        }
      }

      // MID 기반 정확한 매칭
      let priceRank: number | undefined;
      let storeRank: number | undefined;
      let foundAtPage: number | undefined;

      // 1. price_compare_mid로 가격비교 순위 찾기
      if (adSlot.price_compare_mid) {
        const priceIndex = allResults.findIndex(item => 
          item.productId === adSlot.price_compare_mid
        );
        if (priceIndex !== -1) {
          priceRank = priceIndex + 1;
          foundAtPage = Math.ceil(priceRank / 100);
          result.is_found = true;
        }
      }

      // 2. product_mid + seller_mid로 스토어 순위 찾기
      if (adSlot.product_mid && adSlot.seller_mid) {
        const storeIndex = allResults.findIndex(item => 
          item.productId === adSlot.product_mid &&
          item.mallName === adSlot.seller_mid
        );
        if (storeIndex !== -1) {
          storeRank = storeIndex + 1;
          if (!foundAtPage) {
            foundAtPage = Math.ceil(storeRank / 100);
          }
          result.is_found = true;
        }
      }

      // 3. 결과 저장
      result.price_rank = priceRank;
      result.store_rank = storeRank;
      result.found_at_page = foundAtPage;

      // 순위 차이 계산
      if (priceRank && adSlot.price_start_rank) {
        result.price_rank_diff = priceRank - adSlot.price_start_rank;
      }
      if (storeRank && adSlot.store_start_rank) {
        result.store_rank_diff = storeRank - adSlot.store_start_rank;
      }

      // 로컬 DB에 저장
      await this.saveRankingToLocalDB({
        ad_slot_id: adSlot.ad_slot_id,
        work_keyword: adSlot.work_keyword,
        price_compare_mid: adSlot.price_compare_mid,
        product_mid: adSlot.product_mid,
        seller_mid: adSlot.seller_mid,
        collected_at: new Date(),
        price_rank: priceRank,
        store_rank: storeRank,
        is_found: result.is_found,
        found_at_page: foundAtPage,
        total_results: allResults.length,
        raw_data: {
          search_pages: adSlotsConfig.schedule.maxPages,
          total_items: allResults.length,
        },
      });

      logger.info(`Ranking collection completed for ad_slot ${adSlot.ad_slot_id}`, {
        keyword: adSlot.work_keyword,
        priceRank,
        storeRank,
        found: result.is_found,
        totalResults: allResults.length,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      logger.error(`Failed to collect ranking for ad_slot ${adSlot.ad_slot_id}:`, error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      
      // 에러 로그
      await this.logApiUsage(
        adSlot.ad_slot_id, 
        adSlot.work_keyword || '', 
        0, 
        Date.now() - startTime, 
        'error',
        result.error
      );
      
      throw error;
    }
  }

  /**
   * 로컬 PostgreSQL에 순위 데이터 저장
   */
  private async saveRankingToLocalDB(ranking: AdSlotRanking): Promise<void> {
    try {
      const query = `
        INSERT INTO ad_slot_rankings (
          ad_slot_id, work_keyword, price_compare_mid, product_mid, seller_mid,
          collected_at, price_rank, store_rank, is_found, found_at_page,
          total_results, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      const values = [
        ranking.ad_slot_id,
        ranking.work_keyword,
        ranking.price_compare_mid,
        ranking.product_mid,
        ranking.seller_mid,
        ranking.collected_at,
        ranking.price_rank,
        ranking.store_rank,
        ranking.is_found,
        ranking.found_at_page,
        ranking.total_results,
        JSON.stringify(ranking.raw_data),
      ];

      await this.localDbPool.query(query, values);
      logger.debug(`Saved ranking to local DB for ad_slot ${ranking.ad_slot_id}`);
    } catch (error) {
      logger.error('Failed to save ranking to local DB:', error);
      throw error;
    }
  }

  /**
   * API 사용 로그
   */
  private async logApiUsage(
    adSlotId: number,
    keyword: string,
    pageNumber: number,
    responseTimeMs: number,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO ad_slot_api_logs (
          ad_slot_id, keyword, page_number, response_time_ms, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await this.localDbPool.query(query, [
        adSlotId,
        keyword,
        pageNumber,
        responseTimeMs,
        status,
        errorMessage,
      ]);
    } catch (error) {
      logger.error('Failed to log API usage:', error);
      // 로그 실패는 무시
    }
  }

  /**
   * 시간별 요약 업데이트
   */
  async updateHourlySummary(adSlotId: number, keyword: string): Promise<void> {
    try {
      const currentHour = new Date();
      currentHour.setMinutes(0, 0, 0);

      const query = `
        INSERT INTO ad_slot_rankings_hourly (
          ad_slot_id, work_keyword, hour,
          avg_price_rank, min_price_rank, max_price_rank,
          avg_store_rank, min_store_rank, max_store_rank,
          sample_count
        )
        SELECT 
          $1, $2, $3,
          AVG(price_rank)::DECIMAL(10,2),
          MIN(price_rank),
          MAX(price_rank),
          AVG(store_rank)::DECIMAL(10,2),
          MIN(store_rank),
          MAX(store_rank),
          COUNT(*)
        FROM ad_slot_rankings
        WHERE ad_slot_id = $1
          AND collected_at >= $3
          AND collected_at < $3 + INTERVAL '1 hour'
          AND is_found = true
        ON CONFLICT (ad_slot_id, hour) 
        DO UPDATE SET
          avg_price_rank = EXCLUDED.avg_price_rank,
          min_price_rank = EXCLUDED.min_price_rank,
          max_price_rank = EXCLUDED.max_price_rank,
          avg_store_rank = EXCLUDED.avg_store_rank,
          min_store_rank = EXCLUDED.min_store_rank,
          max_store_rank = EXCLUDED.max_store_rank,
          sample_count = EXCLUDED.sample_count
      `;

      await this.localDbPool.query(query, [adSlotId, keyword, currentHour]);
      logger.debug(`Updated hourly summary for ad_slot ${adSlotId}`);
    } catch (error) {
      logger.error('Failed to update hourly summary:', error);
      // 요약 업데이트 실패는 무시
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
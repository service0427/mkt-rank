import { SupabaseService } from '../database/supabase.service';
import { LocalPostgresService } from '../database/local-postgres.service';
import { SimplifiedDataSyncService } from '../sync/data-sync-simplified.service';
import { NaverShoppingProvider } from '../../providers/naver-shopping.provider';
import { ApiKeyManager } from '../../providers/api-key-manager';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { Keyword, SearchResult, ShoppingRanking } from '../../types';

export class RankingService {
  private supabaseService: SupabaseService;
  private localDbService: LocalPostgresService;
  private dataSyncService: SimplifiedDataSyncService;
  private searchProvider: NaverShoppingProvider;

  constructor() {
    this.supabaseService = new SupabaseService();
    this.localDbService = new LocalPostgresService();
    this.dataSyncService = new SimplifiedDataSyncService(this.localDbService, this.supabaseService);
    const apiKeyManager = new ApiKeyManager(config.naver.apiKeys);
    this.searchProvider = new NaverShoppingProvider(apiKeyManager);
  }

  /**
   * Collect rankings for all active keywords
   */
  async collectRankings(): Promise<void> {
    logger.info('Starting ranking collection process');
    const startTime = Date.now();

    try {
      // Get active keywords
      const keywords = await this.supabaseService.getActiveKeywords();
      
      if (keywords.length === 0) {
        logger.warn('No active keywords found');
        return;
      }

      logger.info(`Found ${keywords.length} active keywords to process`);

      // Process each keyword
      let successCount = 0;
      let errorCount = 0;

      for (const keyword of keywords) {
        try {
          await this.collectKeywordRankings(keyword);
          successCount++;
          
          // Add delay between keywords to avoid rate limiting
          await this.sleep(1000); // 1 second delay
        } catch (error) {
          errorCount++;
          logger.error(`Failed to collect rankings for keyword: ${keyword.keyword}`, {
            error,
            keywordId: keyword.id,
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Ranking collection completed', {
        duration: `${duration}ms`,
        totalKeywords: keywords.length,
        successCount,
        errorCount,
      });

      // Sync to Supabase - handled by queue-monitor after all keywords collected
      logger.info('Individual keyword collection completed. Sync will be handled by queue-monitor.');
    } catch (error) {
      logger.error('Ranking collection process failed', { error });
      throw error;
    }
  }

  /**
   * Collect rankings for a single keyword
   */
  public async collectKeywordRankings(keyword: Keyword): Promise<void> {
    logger.info(`Collecting rankings for keyword: ${keyword.keyword}`);
    const collectedAt = new Date();
    const allResults: SearchResult[] = [];

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchPageWithMetrics(keyword, 1);
      allResults.push(...firstPage.results);

      // Calculate total pages needed
      const totalPages = Math.min(
        Math.ceil(firstPage.totalCount / config.search.itemsPerPage),
        config.search.maxPages
      );

      logger.debug(`Total pages to fetch: ${totalPages} for keyword: ${keyword.keyword}`);

      // Fetch remaining pages
      for (let page = 2; page <= totalPages; page++) {
        const pageResults = await this.fetchPageWithMetrics(keyword, page);
        allResults.push(...pageResults.results);
        
        // Add small delay between pages
        await this.sleep(500);
      }

      // Prepare rankings for local database
      const rankings: ShoppingRanking[] = allResults.map((result, index) => ({
        keyword_id: keyword.id,
        keyword_name: keyword.keyword,
        product_id: result.productId,
        rank: index + 1,
        title: result.title,
        link: result.link,
        image: result.image,
        lprice: result.lprice,
        hprice: result.hprice,
        mall_name: result.mallName,
        product_type: parseInt(result.productType) || 1,
        brand: result.brand,
        maker: result.maker,
        category1: result.category1,
        category2: result.category2,
        category3: result.category3,
        category4: result.category4,
        collected_at: collectedAt,
      }));

      // Save to local PostgreSQL first
      await this.localDbService.saveRankings(rankings);
      
      // Run full sync (includes current, hourly if at top of hour, daily if midnight)
      await this.dataSyncService.runFullSync([keyword.id]);
      
      // Update last collected timestamp in Supabase
      await this.supabaseService.updateKeywordLastCollected(keyword.id);

      logger.info(`Successfully collected ${allResults.length} rankings for keyword: ${keyword.keyword}`);
    } catch (error) {
      logger.error(`Failed to collect rankings for keyword: ${keyword.keyword}`, {
        error,
        keywordId: keyword.id,
      });
      throw error;
    }
  }

  /**
   * Fetch a page of results with API usage tracking
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
      return response;
    } catch (error: any) {
      success = false;
      errorMessage = error.message;
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;

      // Log API usage
      await this.supabaseService.logApiUsage({
        provider: 'naver_shopping',
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
   * Get database statistics
   */
  async getStatistics(): Promise<any> {
    const localStats = await this.localDbService.getStatistics();
    return {
      local: localStats,
      lastSync: new Date().toISOString()
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
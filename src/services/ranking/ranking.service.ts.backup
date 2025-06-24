import { SupabaseService } from '../database/supabase.service';
import { NaverShoppingProvider } from '../../providers/naver-shopping.provider';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { Keyword, RankingData, SearchResult } from '../../types';

export class RankingService {
  private supabaseService: SupabaseService;
  private searchProvider: NaverShoppingProvider;

  constructor() {
    this.supabaseService = new SupabaseService();
    this.searchProvider = new NaverShoppingProvider();
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

      // Clean up old rankings
      await this.cleanupOldData();
    } catch (error) {
      logger.error('Ranking collection process failed', { error });
      throw error;
    }
  }

  /**
   * Collect rankings for a single keyword
   */
  private async collectKeywordRankings(keyword: Keyword): Promise<void> {
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

      // Save rankings to database
      const rankingData: RankingData = {
        keyword,
        results: allResults,
        collectedAt,
      };

      await this.supabaseService.insertRankings(rankingData);
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
   * Clean up old data
   */
  private async cleanupOldData(): Promise<void> {
    try {
      const deletedCount = await this.supabaseService.cleanupOldRankings(30);
      logger.info(`Cleaned up ${deletedCount} old ranking records`);
    } catch (error) {
      logger.error('Failed to cleanup old data', { error });
      // Don't throw - cleanup failure shouldn't stop the main process
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
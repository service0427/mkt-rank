import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  Keyword,
  Ranking,
  ApiUsage,
  DatabaseError,
  RankingData,
} from '../../types';

export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.anonKey);
  }

  /**
   * Get all active keywords
   */
  async getActiveKeywords(): Promise<Keyword[]> {
    try {
      const { data, error } = await this.client
        .from('keywords')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (error) {
        throw new DatabaseError(error.message, 'getActiveKeywords');
      }

      logger.info(`Fetched ${data?.length || 0} active keywords`);
      return data || [];
    } catch (error) {
      logger.error('Failed to fetch active keywords', { error });
      throw error;
    }
  }

  /**
   * Insert ranking data
   */
  async insertRankings(rankingData: RankingData): Promise<void> {
    try {
      const { keyword, results, collectedAt } = rankingData;

      // Prepare ranking records
      const rankings: Omit<Ranking, 'id' | 'created_at'>[] = results.map(
        (result, index) => ({
          keyword_id: keyword.id,
          product_id: result.productId,
          title: result.title,
          link: result.link,
          image: result.image,
          price: result.price,
          mall_name: result.mallName,
          category1: result.category1,
          category2: result.category2,
          category3: result.category3,
          category4: result.category4,
          rank: index + 1,
          collected_at: collectedAt.toISOString(),
        })
      );

      // Insert in batches to avoid hitting limits
      const batchSize = 100;
      for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);
        const { error } = await this.client.from('rankings').insert(batch);

        if (error) {
          throw new DatabaseError(
            `Failed to insert rankings batch: ${error.message}`,
            'insertRankings'
          );
        }
      }

      logger.info(
        `Inserted ${rankings.length} rankings for keyword: ${keyword.keyword}`
      );
    } catch (error) {
      logger.error('Failed to insert rankings', { error });
      throw error;
    }
  }

  /**
   * Log API usage
   */
  async logApiUsage(usage: Omit<ApiUsage, 'id' | 'created_at'>): Promise<void> {
    try {
      const { error } = await this.client.from('api_usage').insert([usage]);

      if (error) {
        throw new DatabaseError(error.message, 'logApiUsage');
      }

      logger.debug('API usage logged', { usage });
    } catch (error) {
      logger.error('Failed to log API usage', { error, usage });
      // Don't throw - API usage logging failure shouldn't stop the main process
    }
  }

  /**
   * Get recent rankings for a keyword
   */
  async getRecentRankings(
    keywordId: string,
    limit: number = 100
  ): Promise<Ranking[]> {
    try {
      const { data, error } = await this.client
        .from('rankings')
        .select('*')
        .eq('keyword_id', keywordId)
        .order('collected_at', { ascending: false })
        .order('rank', { ascending: true })
        .limit(limit);

      if (error) {
        throw new DatabaseError(error.message, 'getRecentRankings');
      }

      return data || [];
    } catch (error) {
      logger.error('Failed to fetch recent rankings', { error, keywordId });
      throw error;
    }
  }

  /**
   * Clean up old rankings (older than specified days)
   */
  async cleanupOldRankings(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { data, error } = await this.client
        .from('rankings')
        .delete()
        .lt('collected_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        throw new DatabaseError(error.message, 'cleanupOldRankings');
      }

      const deletedCount = data?.length || 0;
      logger.info(`Cleaned up ${deletedCount} old rankings`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old rankings', { error });
      throw error;
    }
  }

  /**
   * Update keyword last collected timestamp
   */
  async updateKeywordLastCollected(keywordId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('keywords')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', keywordId);

      if (error) {
        throw new DatabaseError(error.message, 'updateKeywordLastCollected');
      }
    } catch (error) {
      logger.error('Failed to update keyword last collected', {
        error,
        keywordId,
      });
      // Don't throw - this is not critical
    }
  }
}
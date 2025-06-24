import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  SearchKeyword,
  ShoppingRanking,
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
   * Get all keywords from search_keywords table
   */
  async getAllKeywords(limit: number = 100): Promise<SearchKeyword[]> {
    try {
      const { data, error } = await this.client
        .from('search_keywords')
        .select('*')
        .order('total_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw new DatabaseError(error.message, 'getAllKeywords');
      }

      logger.info(`Fetched ${data?.length || 0} keywords`);
      return data || [];
    } catch (error) {
      logger.error('Failed to fetch keywords', { error });
      throw error;
    }
  }

  /**
   * Get keywords by specific criteria
   */
  async getKeywordsByCount(minCount: number = 1000): Promise<SearchKeyword[]> {
    try {
      const { data, error } = await this.client
        .from('search_keywords')
        .select('*')
        .gte('total_count', minCount)
        .order('total_count', { ascending: false });

      if (error) {
        throw new DatabaseError(error.message, 'getKeywordsByCount');
      }

      logger.info(`Fetched ${data?.length || 0} keywords with count >= ${minCount}`);
      return data || [];
    } catch (error) {
      logger.error('Failed to fetch keywords by count', { error });
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
      const rankings: Omit<ShoppingRanking, 'id' | 'created_at'>[] = results.map(
        (result, index) => ({
          keyword_id: keyword.id,
          product_id: result.productId,
          title: result.title,
          link: result.link,
          image: result.image,
          lprice: result.lprice,
          hprice: result.hprice,
          mall_name: result.mallName,
          product_type: result.productType,
          brand: result.brand,
          maker: result.maker,
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
        const { error } = await this.client.from('shopping_rankings').insert(batch);

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
  ): Promise<ShoppingRanking[]> {
    try {
      const { data, error } = await this.client
        .from('shopping_rankings')
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
   * Check if rankings table exists
   */
  async checkRankingsTable(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('shopping_rankings')
        .select('id')
        .limit(1);

      if (error && error.code === '42P01') {
        // Table doesn't exist
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check rankings table', { error });
      return false;
    }
  }

  /**
   * Create rankings table if it doesn't exist
   */
  async createRankingsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS rankings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        keyword_id UUID REFERENCES search_keywords(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT,
        image TEXT,
        price INTEGER,
        mall_name TEXT,
        category1 TEXT,
        category2 TEXT,
        category3 TEXT,
        category4 TEXT,
        rank INTEGER NOT NULL,
        collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
        UNIQUE(keyword_id, product_id, collected_at)
      );
      
      CREATE INDEX IF NOT EXISTS idx_rankings_keyword_collected 
        ON rankings(keyword_id, collected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rankings_product 
        ON rankings(product_id);
    `;

    try {
      const { error } = await this.client.rpc('exec_sql', {
        sql: createTableSQL
      });

      if (error) {
        logger.warn('Table creation via RPC failed, table might already exist');
      } else {
        logger.info('Rankings table created successfully');
      }
    } catch (error) {
      logger.error('Failed to create rankings table', { error });
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
}
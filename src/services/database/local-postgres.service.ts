import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { ShoppingRanking } from '../../types';

export class LocalPostgresService {
  public pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.LOCAL_PG_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_PG_PORT || '5432'),
      database: process.env.LOCAL_PG_DATABASE || 'mkt_rank_local',
      user: process.env.LOCAL_PG_USER || process.env.USER,
      password: process.env.LOCAL_PG_PASSWORD || '',
      max: 20, // 최대 연결 수
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Local PostgreSQL connection successful');
      return true;
    } catch (error) {
      logger.error('Local PostgreSQL connection failed:', error);
      return false;
    }
  }

  async saveRankings(rankings: ShoppingRanking[]): Promise<void> {
    const client = await this.pool.connect();
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
          ranking.hprice,
          ranking.mall_name,
          ranking.product_type,
          ranking.brand,
          ranking.maker,
          ranking.category1,
          ranking.category2,
          ranking.category3,
          ranking.category4,
          ranking.collected_at
        );
      });

      const query = `
        INSERT INTO shopping_rankings (
          keyword_id, keyword_name, product_id, rank, title, link, image,
          lprice, hprice, mall_name, product_type, brand, maker,
          category1, category2, category3, category4, collected_at
        ) VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      await client.query('COMMIT');

      logger.info(`Saved ${rankings.length} rankings to local PostgreSQL`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save rankings to local PostgreSQL:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getRecentRankings(
    keywordId: string,
    limit: number = 100
  ): Promise<ShoppingRanking[]> {
    const query = `
      SELECT * FROM shopping_rankings
      WHERE keyword_id = $1
      ORDER BY collected_at DESC, rank ASC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [keywordId, limit]);
    return result.rows;
  }

  async getHourlyAggregates(
    keywordId: string,
    hours: number = 24
  ): Promise<any[]> {
    const query = `
      SELECT * FROM shopping_rankings_hourly
      WHERE keyword_id = $1 
        AND hour >= NOW() - INTERVAL '${hours} hours'
      ORDER BY hour DESC, avg_rank ASC
    `;

    const result = await this.pool.query(query, [keywordId]);
    return result.rows;
  }

  async getDailyAggregates(
    keywordId: string,
    days: number = 30
  ): Promise<any[]> {
    const query = `
      SELECT * FROM shopping_rankings_daily
      WHERE keyword_id = $1 
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC, avg_rank ASC
    `;

    const result = await this.pool.query(query, [keywordId]);
    return result.rows;
  }

  async runHourlyAggregation(): Promise<void> {
    try {
      await this.pool.query('SELECT aggregate_hourly_rankings()');
      logger.info('Hourly aggregation completed');
    } catch (error) {
      logger.error('Hourly aggregation failed:', error);
      throw error;
    }
  }

  async runDailyAggregation(): Promise<void> {
    try {
      await this.pool.query('SELECT aggregate_daily_rankings()');
      logger.info('Daily aggregation completed');
    } catch (error) {
      logger.error('Daily aggregation failed:', error);
      throw error;
    }
  }

  async getStatistics(): Promise<any> {
    const query = `
      SELECT 
        metric,
        value
      FROM data_statistics
    `;

    const result = await this.pool.query(query);
    const stats: any = {};
    result.rows.forEach((row) => {
      stats[row.metric] = row.value;
    });
    return stats;
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }
}
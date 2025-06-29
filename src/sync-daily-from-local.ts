import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { logger } from './utils/logger';

async function syncDailyFromLocal() {
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  
  try {
    logger.info('Syncing daily data from local PostgreSQL...');
    
    // Get active keywords
    const keywords = await supabase.getActiveKeywords();
    
    logger.info(`Processing ${keywords.length} keywords...`);
    
    for (const keyword of keywords) {
      logger.info(`Checking data for keyword: ${keyword.keyword} (ID: ${keyword.id})`);
      
      // Get data from local DB for 27일 14:00 UTC (23:00 KST)
      const query = `
        SELECT * FROM shopping_rankings
        WHERE keyword_id = $1
          AND collected_at >= '2025-06-27 14:00:00'
          AND collected_at < '2025-06-27 15:00:00'
        ORDER BY rank ASC
        LIMIT 100
      `;
      
      const result = await localDb.pool.query(query, [keyword.id]);
      const rankings = result.rows;
      
      logger.info(`Query result: ${rankings.length} rows found`);
      
      if (rankings.length === 0) {
        // Check what data exists for this keyword
        const checkQuery = `
          SELECT DATE_TRUNC('hour', collected_at) as hour, COUNT(*) as count
          FROM shopping_rankings
          WHERE keyword_id = $1
            AND collected_at >= '2025-06-27 00:00:00'
          GROUP BY hour
          ORDER BY hour DESC
          LIMIT 5
        `;
        const checkResult = await localDb.pool.query(checkQuery, [keyword.id]);
        logger.warn(`No data found for keyword ${keyword.keyword} at 14:00 UTC`);
        logger.info(`Available hours for this keyword:`, checkResult.rows);
        continue;
      }
      
      logger.info(`Found ${rankings.length} rankings for keyword ${keyword.keyword}`);
      
      // Save to daily table
      const { error } = await supabase.client
        .from('shopping_rankings_daily')
        .upsert(
          rankings.map(ranking => ({
            keyword_id: ranking.keyword_id,
            product_id: ranking.product_id,
            date: '2025-06-27',  // 27일 데이터
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
        logger.error(`Failed to sync daily data for keyword ${keyword.keyword}:`, error);
      } else {
        logger.info(`Synced daily snapshot for keyword ${keyword.keyword}`);
      }
    }
    
    // Check results
    const { count } = await supabase.client
      .from('shopping_rankings_daily')
      .select('*', { count: 'exact', head: true })
      .eq('date', '2025-06-27');
      
    logger.info(`Daily sync completed. Total records for 2025-06-27: ${count}`);
    
  } catch (error) {
    logger.error('Sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

syncDailyFromLocal();
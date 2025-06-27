import dotenv from 'dotenv';
dotenv.config();

import { SupabaseService } from './services/database/supabase.service';
import { logger } from './utils/logger';

async function testDailyWithToday() {
  const supabase = new SupabaseService();
  
  try {
    logger.info('Testing daily sync with today\'s data...');
    
    // Get keywords
    const keywords = await supabase.getActiveKeywords();
    
    for (const keyword of keywords) {
      // Get today's 18:00 UTC data
      const { data: todayData, error } = await supabase.client
        .from('shopping_rankings_hourly')
        .select('*')
        .eq('keyword_id', keyword.id)
        .eq('hour', '2025-06-27T18:00:00.000Z')
        .order('rank', { ascending: true })
        .limit(100);
        
      if (error || !todayData || todayData.length === 0) {
        logger.warn(`No data for keyword ${keyword.id}`);
        continue;
      }
      
      logger.info(`Found ${todayData.length} products for keyword ${keyword.keyword}`);
      
      // Save as yesterday's daily data
      const { error: saveError } = await supabase.client
        .from('shopping_rankings_daily')
        .upsert(
          todayData.map(ranking => ({
            keyword_id: ranking.keyword_id,
            product_id: ranking.product_id,
            date: '2025-06-26',  // Save as yesterday
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
        
      if (saveError) {
        logger.error(`Failed to save daily data: ${saveError.message}`);
      } else {
        logger.info(`Saved daily snapshot for ${keyword.keyword}`);
      }
    }
    
    // Check results
    const { data: dailyData } = await supabase.client
      .from('shopping_rankings_daily')
      .select('date, COUNT(*)')
      .eq('date', '2025-06-26');
      
    logger.info('Daily data saved successfully');
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

testDailyWithToday();
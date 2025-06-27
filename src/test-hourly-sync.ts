import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { SimplifiedDataSyncService } from './services/sync/data-sync-simplified.service';
import { logger } from './utils/logger';

async function testHourlySync() {
  logger.info('Testing hourly sync...');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  const syncService = new SimplifiedDataSyncService(localDb, supabase);
  
  try {
    // Get active keywords
    const keywords = await supabase.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords`);
    
    if (keywords.length > 0) {
      // Test with just one keyword first
      const testKeywordId = keywords[0].id;
      logger.info(`Testing with keyword: ${keywords[0].keyword} (ID: ${testKeywordId})`);
      
      // Check if we have local data
      const localData = await localDb.getRecentRankings(testKeywordId, 10);
      logger.info(`Found ${localData.length} local rankings`);
      
      if (localData.length > 0) {
        logger.info('Sample local data:', {
          product_id: localData[0].product_id,
          rank: localData[0].rank,
          collected_at: localData[0].collected_at
        });
      }
      
      // Run hourly sync for all keywords
      logger.info('Starting hourly sync for all keywords...');
      await syncService.syncHourlySnapshots(keywords.map(k => k.id));
      
      // Check if data was synced
      const { data, error } = await supabase.client
        .from('shopping_rankings_hourly')
        .select('hour, keyword_id')
        .order('hour', { ascending: false })
        .limit(10);
        
      if (error) {
        logger.error('Error checking hourly data:', error);
      } else {
        logger.info(`Found ${data.length} records in shopping_rankings_hourly`);
        if (data.length > 0) {
          logger.info('Latest hourly record:', data[0]);
        }
      }
    }
    
  } catch (error) {
    logger.error('Test hourly sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

testHourlySync();
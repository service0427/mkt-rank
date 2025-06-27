import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { SimplifiedDataSyncService } from './services/sync/data-sync-simplified.service';
import { logger } from './utils/logger';

async function testDailySync() {
  logger.info('Testing daily sync...');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  const syncService = new SimplifiedDataSyncService(localDb, supabase);
  
  try {
    // Get active keywords
    const keywords = await supabase.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords`);
    
    if (keywords.length > 0) {
      // Force daily sync regardless of time
      logger.info('Forcing daily snapshot sync...');
      await syncService.syncDailySnapshots(keywords.map(k => k.id));
      
      // Check if data was synced
      const { data, error } = await supabase.client
        .from('shopping_rankings_daily')
        .select('*')
        .limit(5)
        .order('last_updated', { ascending: false });
        
      if (error) {
        logger.error('Error checking daily data:', error);
      } else {
        logger.info(`Found ${data?.length || 0} daily records after sync`);
        if (data && data.length > 0) {
          logger.info('Sample daily record:', {
            date: data[0].date,
            keyword_id: data[0].keyword_id.substring(0, 8) + '...',
            rank: data[0].rank
          });
        }
      }
    }
    
  } catch (error) {
    logger.error('Test daily sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

testDailySync();
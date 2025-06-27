import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { SimplifiedDataSyncService } from './services/sync/data-sync-simplified.service';
import { logger } from './utils/logger';

async function forceDailySync() {
  logger.info('Forcing daily sync...');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  const syncService = new SimplifiedDataSyncService(localDb, supabase);
  
  try {
    // Get active keywords
    const keywords = await supabase.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords`);
    
    if (keywords.length > 0) {
      // Force daily sync
      logger.info('Starting forced daily snapshot sync...');
      await syncService.syncDailySnapshots(keywords.map(k => k.id));
      
      // Check if data was synced
      const { data, error } = await supabase.client
        .from('shopping_rankings_daily')
        .select('date, keyword_id')
        .order('date', { ascending: false })
        .limit(20);
        
      if (error) {
        logger.error('Error checking daily data:', error);
      } else {
        logger.info(`Found ${data.length} records in shopping_rankings_daily`);
        if (data.length > 0) {
          // Group by date
          const dateGroups = data.reduce((acc: any, item: any) => {
            acc[item.date] = (acc[item.date] || 0) + 1;
            return acc;
          }, {});
          
          logger.info('Latest daily data:');
          Object.entries(dateGroups)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, count]) => {
              logger.info(`${date} - ${count} records`);
            });
        }
      }
    }
    
  } catch (error) {
    logger.error('Force daily sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

forceDailySync();
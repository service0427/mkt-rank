import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { SimplifiedDataSyncService } from './services/sync/data-sync-simplified.service';
import { logger } from './utils/logger';

async function forceHourlySync() {
  logger.info('Forcing hourly sync for current data...');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  const syncService = new SimplifiedDataSyncService(localDb, supabase);
  
  try {
    // Get active keywords
    const keywords = await supabase.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords`);
    
    if (keywords.length > 0) {
      // Force hourly sync regardless of time
      logger.info('Starting forced hourly snapshot sync...');
      await syncService.syncHourlySnapshots(keywords.map(k => k.id));
      
      // Check if data was synced
      const { data, error } = await supabase.client
        .from('shopping_rankings_hourly')
        .select('hour, keyword_id')
        .order('hour', { ascending: false })
        .limit(20);
        
      if (error) {
        logger.error('Error checking hourly data:', error);
      } else {
        // Group by hour
        const hourGroups = data.reduce((acc: any, item: any) => {
          const hour = new Date(item.hour).toISOString().substring(0, 13);
          acc[hour] = (acc[hour] || 0) + 1;
          return acc;
        }, {});
        
        logger.info('Latest hourly data:');
        Object.entries(hourGroups)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .forEach(([hour, count]) => {
            logger.info(`${hour}:00 - ${count} records`);
          });
      }
    }
    
  } catch (error) {
    logger.error('Force hourly sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

forceHourlySync();
import dotenv from 'dotenv';
dotenv.config();

import { LocalPostgresService } from './services/database/local-postgres.service';
import { SupabaseService } from './services/database/supabase.service';
import { SimplifiedDataSyncService } from './services/sync/data-sync-simplified.service';
import { logger } from './utils/logger';

async function testSync() {
  logger.info('Testing data sync between local PostgreSQL and Supabase');
  
  const localDb = new LocalPostgresService();
  const supabase = new SupabaseService();
  const syncService = new SimplifiedDataSyncService(localDb, supabase);
  
  try {
    // Test connections
    logger.info('Testing local PostgreSQL connection...');
    const localConnected = await localDb.testConnection();
    logger.info(`Local PostgreSQL connected: ${localConnected}`);
    
    logger.info('Testing Supabase connection...');
    // Supabase connection is automatic, just try to fetch keywords
    logger.info('Supabase connection established');
    
    // Get active keywords from Supabase
    logger.info('Fetching active keywords from Supabase...');
    const keywords = await supabase.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords`);
    
    if (keywords.length > 0) {
      // Check if we have local data for the first keyword
      const firstKeyword = keywords[0];
      logger.info(`Checking local data for keyword: ${firstKeyword.keyword} (ID: ${firstKeyword.id})`);
      
      const localRankings = await localDb.getRecentRankings(firstKeyword.id, 10);
      logger.info(`Found ${localRankings.length} rankings in local DB`);
      
      if (localRankings.length > 0) {
        // Try to sync just this keyword
        logger.info('Attempting to sync current rankings to Supabase...');
        await syncService.syncCurrentRankings([firstKeyword.id]);
        logger.info('Sync completed successfully!');
        
        // Verify the sync by checking Supabase
        const { data, error } = await supabase.client
          .from('shopping_rankings_current')
          .select('*')
          .eq('keyword_id', firstKeyword.id)
          .limit(5);
          
        if (error) {
          logger.error('Error checking Supabase after sync:', error);
        } else {
          logger.info(`Found ${data?.length || 0} rankings in Supabase after sync`);
        }
      } else {
        logger.warn('No local rankings found to sync');
      }
    }
    
  } catch (error) {
    logger.error('Test sync failed:', error);
  } finally {
    await localDb.cleanup();
  }
}

testSync();
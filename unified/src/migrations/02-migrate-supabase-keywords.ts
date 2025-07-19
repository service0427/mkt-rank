// Migrate keywords from Supabase
import { createClient } from '@supabase/supabase-js';
import { query, withTransaction } from '../db/postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrateSupabaseKeywords(serviceId?: string) {
  console.log('Starting Supabase keywords migration...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials not found in environment variables');
  }
  
  // Get service ID if not provided
  if (!serviceId) {
    const [service] = await query<{ service_id: string }>(`
      SELECT service_id FROM unified_services WHERE service_code = 'mkt-guide'
    `);
    if (!service) {
      throw new Error('mkt-guide service not found. Run 01-initial-services.ts first');
    }
    serviceId = service.service_id;
  }
  
  // Create Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  try {
    // Fetch keywords from Supabase
    const { data: keywords, error } = await supabase
      .from('search_keywords')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    console.log(`Found ${keywords?.length || 0} active keywords in Supabase`);
    
    if (!keywords || keywords.length === 0) {
      console.log('No keywords to migrate');
      return;
    }
    
    // Migrate in batches
    const batchSize = 100;
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      
      await withTransaction(async (client) => {
        for (const keyword of batch) {
          try {
            await client.query(`
              INSERT INTO unified_search_keywords (
                keyword_id, keyword, service_id, is_active,
                pc_count, mobile_count, total_count,
                pc_ratio, mobile_ratio, type, user_id, metadata,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (keyword, service_id, type) 
              DO UPDATE SET
                is_active = EXCLUDED.is_active,
                pc_count = EXCLUDED.pc_count,
                mobile_count = EXCLUDED.mobile_count,
                total_count = EXCLUDED.total_count,
                pc_ratio = EXCLUDED.pc_ratio,
                mobile_ratio = EXCLUDED.mobile_ratio,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            `, [
              `kw_supabase_${keyword.id}`,
              keyword.keyword,
              serviceId,
              keyword.active,
              keyword.pc_search_volume || 0,
              keyword.mobile_search_volume || 0,
              keyword.total_search_volume || 0,
              keyword.pc_ratio || 0,
              keyword.mobile_ratio || 0,
              'shopping',
              keyword.user_id || null,
              JSON.stringify({
                original_id: keyword.id,
                source: 'supabase',
                migrated_at: new Date()
              }),
              keyword.created_at,
              keyword.updated_at || keyword.created_at
            ]);
            
            successCount++;
          } catch (error) {
            console.error(`Failed to migrate keyword: ${keyword.keyword}`, error);
            failedCount++;
          }
        }
      });
      
      console.log(`Progress: ${Math.min(i + batchSize, keywords.length)}/${keywords.length}`);
    }
    
    console.log(`\nMigration completed:`);
    console.log(`- Success: ${successCount}`);
    console.log(`- Failed: ${failedCount}`);
    console.log(`- Total: ${keywords.length}`);
    
    // Create sync log
    await query(`
      INSERT INTO unified_sync_logs (
        sync_id, service_id, sync_type, sync_direction,
        started_at, completed_at, status,
        total_records, success_records, failed_records
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      'sync_migration_supabase_' + Date.now(),
      serviceId,
      'full',
      'import',
      new Date(),
      new Date(),
      failedCount > 0 ? 'partial' : 'success',
      keywords.length,
      successCount,
      failedCount
    ]);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateSupabaseKeywords()
    .then(() => {
      console.log('Supabase keywords migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateSupabaseKeywords };
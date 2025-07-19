// Migrate keywords from MySQL (ad_slots)
import mysql from 'mysql2/promise';
import { query, withTransaction } from '../db/postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrateMySQLKeywords(serviceId?: string) {
  console.log('Starting MySQL ad_slots migration...');
  
  // Get service ID if not provided
  if (!serviceId) {
    const [service] = await query<{ service_id: string }>(`
      SELECT service_id FROM unified_services WHERE service_code = 'top-re'
    `);
    if (!service) {
      throw new Error('top-re service not found. Run 01-initial-services.ts first');
    }
    serviceId = service.service_id;
  }
  
  // Create MySQL connection
  const mysqlConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD
  });
  
  try {
    // Fetch ad_slots with work_keyword
    const [adSlots] = await mysqlConnection.execute(`
      SELECT 
        ad_slot_id,
        work_keyword,
        price_compare_mid,
        product_mid,
        seller_mid,
        is_active,
        created_at,
        updated_at
      FROM ad_slots 
      WHERE work_keyword IS NOT NULL 
        AND work_keyword != ''
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${(adSlots as any[]).length} ad_slots with keywords`);
    
    if (!adSlots || (adSlots as any[]).length === 0) {
      console.log('No ad_slots to migrate');
      return;
    }
    
    // Group by keyword
    const keywordMap = new Map<string, any[]>();
    for (const slot of adSlots as any[]) {
      if (!keywordMap.has(slot.work_keyword)) {
        keywordMap.set(slot.work_keyword, []);
      }
      keywordMap.get(slot.work_keyword)!.push(slot);
    }
    
    console.log(`Found ${keywordMap.size} unique keywords`);
    
    // Migrate keywords
    let successCount = 0;
    let failedCount = 0;
    
    for (const [keyword, slots] of keywordMap) {
      try {
        // Use the most recent slot's data
        const latestSlot = slots.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        
        await withTransaction(async (client) => {
          await client.query(`
            INSERT INTO unified_search_keywords (
              keyword_id, keyword, service_id, is_active,
              pc_count, mobile_count, total_count,
              pc_ratio, mobile_ratio, type, metadata,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (keyword, service_id, type) 
            DO UPDATE SET
              is_active = EXCLUDED.is_active,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          `, [
            `kw_mysql_${latestSlot.ad_slot_id}`,
            keyword,
            serviceId,
            slots.some(s => s.is_active === 1), // Active if any slot is active
            0, // No search volume data in ad_slots
            0,
            0,
            0,
            0,
            'ad_slots',
            JSON.stringify({
              ad_slot_ids: slots.map(s => s.ad_slot_id),
              price_compare_mids: [...new Set(slots.map(s => s.price_compare_mid).filter(Boolean))],
              product_mids: [...new Set(slots.map(s => s.product_mid).filter(Boolean))],
              seller_mids: [...new Set(slots.map(s => s.seller_mid).filter(Boolean))],
              source: 'mysql_ad_slots',
              migrated_at: new Date()
            }),
            latestSlot.created_at,
            latestSlot.updated_at || latestSlot.created_at
          ]);
        });
        
        successCount++;
      } catch (error) {
        console.error(`Failed to migrate keyword: ${keyword}`, error);
        failedCount++;
      }
    }
    
    console.log(`\nMigration completed:`);
    console.log(`- Success: ${successCount}`);
    console.log(`- Failed: ${failedCount}`);
    console.log(`- Total keywords: ${keywordMap.size}`);
    console.log(`- Total ad_slots: ${(adSlots as any[]).length}`);
    
    // Create sync log
    await query(`
      INSERT INTO unified_sync_logs (
        sync_id, service_id, sync_type, sync_direction,
        started_at, completed_at, status,
        total_records, success_records, failed_records
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      'sync_migration_mysql_' + Date.now(),
      serviceId,
      'full',
      'import',
      new Date(),
      new Date(),
      failedCount > 0 ? 'partial' : 'success',
      keywordMap.size,
      successCount,
      failedCount
    ]);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await mysqlConnection.end();
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateMySQLKeywords()
    .then(() => {
      console.log('MySQL ad_slots migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateMySQLKeywords };
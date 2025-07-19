// Run all migrations in sequence
import { createInitialServices } from './01-initial-services';
import { migrateSupabaseKeywords } from './02-migrate-supabase-keywords';
import { migrateMySQLKeywords } from './03-migrate-mysql-keywords';

async function runAllMigrations() {
  console.log('Starting unified system migrations...\n');
  
  try {
    // Step 1: Create initial services
    console.log('=== Step 1: Creating initial services ===');
    const { mktGuideServiceId, topReServiceId } = await createInitialServices();
    console.log('✓ Services created successfully\n');
    
    // Step 2: Migrate Supabase keywords
    console.log('=== Step 2: Migrating Supabase keywords ===');
    await migrateSupabaseKeywords(mktGuideServiceId);
    console.log('✓ Supabase keywords migrated successfully\n');
    
    // Step 3: Migrate MySQL keywords
    console.log('=== Step 3: Migrating MySQL ad_slots keywords ===');
    await migrateMySQLKeywords(topReServiceId);
    console.log('✓ MySQL keywords migrated successfully\n');
    
    console.log('=== All migrations completed successfully! ===');
    
    // Show summary
    const [keywordStats] = await import('../db/postgres').then(m => 
      m.query(`
        SELECT 
          COUNT(*) as total_keywords,
          COUNT(DISTINCT service_id) as total_services,
          SUM(CASE WHEN type = 'shopping' THEN 1 ELSE 0 END) as shopping_keywords,
          SUM(CASE WHEN type = 'ad_slots' THEN 1 ELSE 0 END) as ad_slots_keywords
        FROM unified_search_keywords
      `)
    );
    
    console.log('\nMigration Summary:');
    console.log(`- Total keywords: ${keywordStats.total_keywords}`);
    console.log(`- Services: ${keywordStats.total_services}`);
    console.log(`- Shopping keywords (from Supabase): ${keywordStats.shopping_keywords}`);
    console.log(`- Ad slots keywords (from MySQL): ${keywordStats.ad_slots_keywords}`);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  runAllMigrations()
    .then(() => {
      console.log('\n✅ All migrations completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { runAllMigrations };
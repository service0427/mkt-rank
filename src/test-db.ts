import { validateConfig } from './config';
import { SupabaseService } from './services/database/supabase.service';
import { logger } from './utils/logger';

async function testDatabase() {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated successfully');

    // Initialize Supabase service
    const supabaseService = new SupabaseService();

    // Test 1: Check if rankings table exists
    console.log('\n========== DATABASE CONNECTION TEST ==========');
    const tableExists = await supabaseService.checkRankingsTable();
    
    if (!tableExists) {
      console.log('Shopping rankings tables do not exist. Creating...');
      
      console.log('\nPlease run the SQL file in Supabase:');
      console.log('src/database-schema-supabase-simplified.sql');
      console.log('\nThis will create:');
      console.log('- shopping_rankings_current (현재 순위)');
      console.log('- shopping_rankings_hourly (시간별 스냅샷)');
      console.log('- shopping_rankings_daily (일별 스냅샷)');
    } else {
      console.log('✓ Shopping rankings tables exist');
    }

    // Test 2: Fetch keywords
    console.log('\n========== FETCHING KEYWORDS ==========');
    const keywords = await supabaseService.getAllKeywords(10);
    
    console.log(`Found ${keywords.length} keywords\n`);
    
    if (keywords.length > 0) {
      console.log('Sample keywords:');
      keywords.slice(0, 5).forEach((keyword, index) => {
        console.log(`${index + 1}. "${keyword.keyword}"`);
        console.log(`   Total Count: ${keyword.total_count}`);
        console.log(`   PC: ${keyword.pc_count} (${keyword.pc_ratio}%)`);
        console.log(`   Mobile: ${keyword.mobile_count} (${keyword.mobile_ratio}%)\n`);
      });

      // Test 3: Check existing rankings for first keyword
      const firstKeyword = keywords[0];
      console.log(`\n========== CHECKING RANKINGS FOR "${firstKeyword.keyword}" ==========`);
      
      const rankings = await supabaseService.getRecentRankings(firstKeyword.id, 5);
      
      if (rankings.length > 0) {
        console.log(`Found ${rankings.length} recent rankings:`);
        rankings.forEach((ranking) => {
          console.log(`- Rank ${ranking.rank}: ${ranking.title}`);
          console.log(`  Price: ₩${ranking.lprice?.toLocaleString() || 'N/A'}`);
          console.log(`  Collected: ${new Date(ranking.collected_at).toLocaleString()}`);
        });
      } else {
        console.log('No rankings found for this keyword yet.');
      }
    } else {
      console.log('No keywords found in the database.');
      console.log('\nTo add keywords, insert them into the search_keywords table:');
      console.log(`
INSERT INTO search_keywords (keyword, pc_count, mobile_count, total_count, pc_ratio, mobile_ratio) 
VALUES 
  ('노트북', 50000, 30000, 80000, 62.5, 37.5),
  ('무선이어폰', 40000, 60000, 100000, 40.0, 60.0);
      `);
    }

    // Test 4: Test API usage logging
    console.log('\n========== TESTING API USAGE LOGGING ==========');
    await supabaseService.logApiUsage({
      provider: 'NaverShopping',
      endpoint: '/search/shop.json',
      keyword_id: keywords[0]?.id || 'test-keyword-id',
      request_count: 1,
      response_time_ms: 250,
      success: true,
    });
    console.log('✓ API usage logged successfully');

  } catch (error) {
    logger.error('Database test failed:', error);
    if (error instanceof Error) {
      console.error('\nError details:', error.message);
      
      if (error.message.includes('SUPABASE_URL') || error.message.includes('SUPABASE_ANON_KEY')) {
        console.log('\n⚠️  Missing Supabase credentials!');
        console.log('Please set the following in your .env file:');
        console.log('- SUPABASE_URL=https://your-project.supabase.co');
        console.log('- SUPABASE_ANON_KEY=your-anon-key');
        console.log('\nYou can find these in your Supabase project settings.');
      }
    }
    process.exit(1);
  }
}

// Run test
testDatabase().then(() => {
  logger.info('Database test completed successfully');
  process.exit(0);
}).catch((error) => {
  logger.error('Database test error:', error);
  process.exit(1);
});
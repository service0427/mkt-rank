import { config, validateConfig } from './config';
import { NaverShoppingProvider } from './providers/naver-shopping.provider';
import { ApiKeyManager } from './providers/api-key-manager';
import { logger } from './utils/logger';

async function testSearch() {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated successfully');

    // Initialize API key manager
    const apiKeyManager = new ApiKeyManager(config.naver.apiKeys);
    
    // Initialize provider
    const provider = new NaverShoppingProvider(apiKeyManager);

    // Test keyword
    const testKeyword = process.argv[2] || '노트북';
    logger.info(`Testing search for keyword: "${testKeyword}"`);

    // Perform search
    const startTime = Date.now();
    const results = await provider.search(testKeyword, 1);
    const duration = Date.now() - startTime;

    // Display results
    console.log('\n========== SEARCH RESULTS ==========');
    console.log(`Keyword: ${testKeyword}`);
    console.log(`Total Count: ${results.totalCount}`);
    console.log(`Results Found: ${results.results.length}`);
    console.log(`Search Duration: ${duration}ms`);
    console.log('\n--- Top 10 Products ---');
    
    results.results.slice(0, 10).forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.title}`);
      console.log(`   Price: ₩${product.price.toLocaleString()}`);
      console.log(`   Mall: ${product.mallName}`);
      console.log(`   Category: ${product.category1} > ${product.category2}`);
      console.log(`   Link: ${product.link}`);
    });

    // Display API key stats
    console.log('\n========== API KEY STATS ==========');
    const stats = apiKeyManager.getStats();
    stats.forEach((stat) => {
      console.log(`Key ${stat.index + 1}: ${stat.clientId} - Used ${stat.usageCount} times`);
    });

  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run test
testSearch().then(() => {
  logger.info('Test completed successfully');
  process.exit(0);
}).catch((error) => {
  logger.error('Test error:', error);
  process.exit(1);
});
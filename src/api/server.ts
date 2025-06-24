import express from 'express';
import cors from 'cors';
import { NaverShoppingProvider } from '../providers/naver-shopping.provider';
import { ApiKeyManager } from '../providers/api-key-manager';
import { config, validateConfig } from '../config';
import { logger } from '../utils/logger';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize providers
let naverProvider: NaverShoppingProvider;
let apiKeyManager: ApiKeyManager;

try {
  validateConfig();
  apiKeyManager = new ApiKeyManager(config.naver.apiKeys);
  naverProvider = new NaverShoppingProvider(apiKeyManager);
} catch (error) {
  logger.error('Failed to initialize API server:', error);
  process.exit(1);
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'mkt-rank-api',
    timestamp: new Date().toISOString()
  });
});

// Search endpoint
app.get('/api/search', async (req, res) => {
  const { keyword } = req.query;
  
  if (!keyword || typeof keyword !== 'string') {
    res.status(400).json({ 
      error: 'Keyword is required',
      message: 'Please provide a keyword parameter' 
    });
    return;
  }

  try {
    logger.info(`API search request for keyword: ${keyword}`);
    const startTime = Date.now();
    
    // Search with Naver API
    const results = await naverProvider.search(keyword, 1);
    const searchTime = Date.now() - startTime;
    
    // Get API key stats from the manager
    const apiKeyStats = apiKeyManager.getStats();
    
    res.json({
      keyword,
      totalCount: results.totalCount,
      resultsCount: results.results.length,
      searchTime,
      results: results.results,
      apiKeyStats
    });
    
    logger.info(`API search completed for keyword: ${keyword}, found ${results.results.length} results`);
  } catch (error: any) {
    logger.error('API search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
});

// Get multiple pages
app.get('/api/search/full', async (req, res) => {
  const { keyword, pages = '5' } = req.query;
  
  if (!keyword || typeof keyword !== 'string') {
    res.status(400).json({ 
      error: 'Keyword is required' 
    });
    return;
  }

  const maxPages = Math.min(parseInt(pages as string), 10);
  
  try {
    logger.info(`API full search request for keyword: ${keyword}, pages: ${maxPages}`);
    const startTime = Date.now();
    const allResults: any[] = [];
    
    // Fetch multiple pages
    for (let page = 1; page <= maxPages; page++) {
      const pageResults = await naverProvider.search(keyword, page);
      allResults.push(...pageResults.results);
      
      // Small delay between requests
      if (page < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    const searchTime = Date.now() - startTime;
    
    res.json({
      keyword,
      totalPages: maxPages,
      totalResults: allResults.length,
      searchTime,
      results: allResults
    });
    
  } catch (error: any) {
    logger.error('API full search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
});

// Start server
export function startApiServer() {
  app.listen(PORT, () => {
    logger.info(`API server running on http://localhost:${PORT}`);
    logger.info('Available endpoints:');
    logger.info('  GET /api/health');
    logger.info('  GET /api/search?keyword=검색어');
    logger.info('  GET /api/search/full?keyword=검색어&pages=5');
  });
}

// If running directly
if (require.main === module) {
  startApiServer();
}
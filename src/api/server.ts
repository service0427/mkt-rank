import express from 'express';
import cors from 'cors';
import path from 'path';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { NaverShoppingProvider } from '../providers/naver-shopping.provider';
import { ApiKeyManager } from '../providers/api-key-manager';
import { config, validateConfig } from '../config';
import { logger } from '../utils/logger';
import monitorRoutes from '../routes/monitor.routes';
import rankingRoutes from '../routes/ranking.routes';

const app = express();
const HTTP_PORT = process.env.API_PORT || 3001;
const HTTPS_PORT = process.env.API_HTTPS_PORT || 3443;

// Middleware
app.use(cors());
app.use(express.json());

// Monitoring routes
app.use('/api/monitor', monitorRoutes);

// Ranking routes
app.use('/api/ranking', rankingRoutes);

// Serve monitoring dashboard
app.get('/monitor', (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/monitor-dashboard.html'));
});

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
  console.log('Starting API server...');
  
  // HTTP 서버 시작
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP API server running on http://localhost:${HTTP_PORT}`);
    logger.info(`HTTP API server running on http://localhost:${HTTP_PORT}`);
  });

  // HTTPS 서버 설정 및 시작
  try {
    console.log('Setting up HTTPS server...');
    let httpsOptions;
    
    // Let's Encrypt 인증서 확인
    const letsEncryptPath = '/etc/letsencrypt/live/mkt.techb.kr';
    console.log(`Checking Let's Encrypt certificate at: ${letsEncryptPath}`);
    
    if (fs.existsSync(`${letsEncryptPath}/privkey.pem`) && fs.existsSync(`${letsEncryptPath}/fullchain.pem`)) {
      console.log('Found Let\'s Encrypt certificate');
      logger.info('Using Let\'s Encrypt certificate');
      httpsOptions = {
        key: fs.readFileSync(`${letsEncryptPath}/privkey.pem`),
        cert: fs.readFileSync(`${letsEncryptPath}/fullchain.pem`)
      };
    } 
    // 자체 서명 인증서 확인
    else if (fs.existsSync(path.join(__dirname, '../../certs/key.pem'))) {
      console.log('Found self-signed certificate');
      logger.info('Using self-signed certificate');
      httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, '../../certs/key.pem')),
        cert: fs.readFileSync(path.join(__dirname, '../../certs/cert.pem'))
      };
    } else {
      console.log('No SSL certificate found, running HTTP only');
      logger.warn('No SSL certificate found, running HTTP only');
      logEndpoints();
      return;
    }

    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`HTTPS API server running on https://localhost:${HTTPS_PORT}`);
      logger.info(`HTTPS API server running on https://localhost:${HTTPS_PORT}`);
      logEndpoints();
    });
  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
    logger.error('Failed to start HTTPS server:', error);
    logger.info('Running in HTTP only mode');
    logEndpoints();
  }
}

// 엔드포인트 로깅 함수
function logEndpoints() {
  logger.info('Available endpoints:');
  logger.info('  GET  /api/health');
  logger.info('  GET  /api/search?keyword=검색어');
  logger.info('  GET  /api/search/full?keyword=검색어&pages=5');
  logger.info('  POST /api/ranking/check');
  logger.info('  POST /api/ranking/check-multiple');
  logger.info('');
  logger.info('=== 새로운 키워드 순위 체크 API 테스트 방법 ===');
  logger.info('');
  logger.info('1. 단일 키워드 체크:');
  logger.info(`   curl -X POST https://mkt.techb.kr:${HTTPS_PORT}/api/ranking/check \\`);
  logger.info('     -H "Content-Type: application/json" \\');
  logger.info('     -d \'{"keyword": "전기자전거"}\'');
  logger.info('');
  logger.info('2. 다중 키워드 체크 (최대 100개):');
  logger.info(`   curl -X POST https://mkt.techb.kr:${HTTPS_PORT}/api/ranking/check-multiple \\`);
  logger.info('     -H "Content-Type: application/json" \\');
  logger.info('     -d \'{"keywords": ["키워드1", "키워드2", "키워드3"]}\'');
  logger.info('');
  logger.info('응답 예시:');
  logger.info('  - isNew: true  → 새로 추가된 키워드 (순위 수집 완료)');
  logger.info('  - isNew: false → 이미 존재하는 키워드 (건너뜀)');
}

// If running directly
if (require.main === module) {
  startApiServer();
}
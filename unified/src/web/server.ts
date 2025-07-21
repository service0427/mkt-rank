// Unified Web Server
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import * as fs from 'fs';
import rateLimit from 'express-rate-limit';

// Import routes
import { servicesRouter } from './routes/services.routes';
import { keywordsRouter } from './routes/keywords.routes';
import { syncRouter } from './routes/sync.routes';
import { rankingsRouter } from './routes/rankings.routes';
import { statsRouter } from './routes/stats.routes';
import apiKeysRouter from './routes/api-keys.routes';
import { webRouter } from './routes/web.routes';
import { rankCheckRouter } from './routes/rank-check.routes';
import { naverApiRouter } from './routes/naver-api.routes';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const PORT = process.env.UNIFIED_API_PORT || 4000;
const HTTPS_PORT = process.env.UNIFIED_HTTPS_PORT || 4443;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/public', express.static(path.join(__dirname, './public')));

// Serve HTML files directly
app.use(express.static(path.join(__dirname, './views')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    service: 'unified-system',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/services', servicesRouter);
app.use('/api/keywords', keywordsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/rankings', rankingsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/keys', apiKeysRouter);
app.use('/api/naver', naverApiRouter); // 네이버 API 직접 호출
app.use('/', rankCheckRouter); // rank check API 등록

// Web Routes (UI pages)
app.use('/', webRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // API error response
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      success: false,
      error: message,
      timestamp: new Date()
    });
  }
  
  // Web page error
  res.status(status).send(`
    <h1>Error ${status}</h1>
    <p>${message}</p>
  `);
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path
    });
  } else {
    res.status(404).send(`
      <h1>404 Not Found</h1>
      <p>Page not found</p>
    `);
  }
});

// Create HTTP server
const server = createServer(app);

// Create HTTPS server
let httpsServer: any = null;
const certPath = '/etc/letsencrypt/live/mkt.techb.kr';
const httpsOptions: any = {};

// Check if SSL certificates exist
if (fs.existsSync(`${certPath}/fullchain.pem`) && fs.existsSync(`${certPath}/privkey.pem`)) {
  httpsOptions.cert = fs.readFileSync(`${certPath}/fullchain.pem`, 'utf8');
  httpsOptions.key = fs.readFileSync(`${certPath}/privkey.pem`, 'utf8');
  httpsServer = createHttpsServer(httpsOptions, app);
}

// WebSocket support for real-time updates (future implementation)
// import { initializeWebSocket } from './websocket';
// initializeWebSocket(server);

// Start server
export function startServer() {
  server.listen(PORT, () => {
    console.log(`Unified Web Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Log available routes
    console.log('\nAvailable Web Pages:');
    console.log(`  http://localhost:${PORT}/ - Dashboard`);
    console.log(`  http://localhost:${PORT}/services - Service Management`);
    console.log(`  http://localhost:${PORT}/keywords - Keyword Search`);
    console.log(`  http://localhost:${PORT}/sync - Sync Management`);
    console.log(`  http://localhost:${PORT}/rankings - Rankings Monitor`);
    console.log(`  http://localhost:${PORT}/api-keys - API Key Management`);
    console.log(`  http://localhost:${PORT}/settings - System Settings`);
    
    console.log('\nAPI Documentation:');
    console.log(`  http://localhost:${PORT}/api/health - Health Check`);
  });

  // Start HTTPS server if certificates are available
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`\nUnified HTTPS Server running on https://localhost:${HTTPS_PORT}`);
      console.log(`External: https://mkt.techb.kr:${HTTPS_PORT}`);
    });
  } else {
    console.log('\nSSL certificates not found. HTTPS server not started.');
    console.log('To enable HTTPS, ensure certificates exist at:', certPath);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing servers...');
  server.close(() => {
    console.log('HTTP server closed');
    if (httpsServer) {
      httpsServer.close(() => {
        console.log('HTTPS server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

// Export app for testing
export { app };

// Run server if this file is executed directly
if (require.main === module) {
  startServer();
}
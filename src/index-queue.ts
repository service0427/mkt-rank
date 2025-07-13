import { logger } from './utils/logger';
import { RankingQueueScheduler } from './schedulers/ranking-queue.scheduler';
import { config } from './config';
import express from 'express';

// Create scheduler instance
const scheduler = new RankingQueueScheduler();
// Make scheduler globally accessible for manual trigger
(global as any).rankingQueueScheduler = scheduler;

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal} signal, starting graceful shutdown`);
  
  try {
    // Stop the scheduler
    await scheduler.stop();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Main application entry point
const main = async () => {
  try {
    logger.info('Starting MKT-RANK Queue-based application', {
      environment: config.environment,
      nodeVersion: process.version,
      queueConcurrency: process.env.QUEUE_CONCURRENCY || '3',
    });

    // Start a simple API server for queue control
    const app = express();
    app.use(express.json());
    
    app.post('/trigger', async (_req, res) => {
      try {
        await scheduler.runManual();
        res.json({ success: true, message: 'Collection triggered' });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    app.get('/status', async (_req, res) => {
      try {
        const status = await scheduler.getStatus();
        res.json(status);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    const PORT = process.env.QUEUE_CONTROL_PORT || 3005;
    app.listen(PORT, () => {
      logger.info(`Queue control API running on port ${PORT}`);
    });

    // Start the queue scheduler
    await scheduler.start();

    // Log scheduler status
    const status = await scheduler.getStatus();
    logger.info('Queue scheduler status', status);

    // Keep the process running
    logger.info('MKT-RANK Queue application is running');
    logger.info('Queue scheduler started. Monitor dashboard available at mkt-rank-api process');
    
  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
};

// Run the application
main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});
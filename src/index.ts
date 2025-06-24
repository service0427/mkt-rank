import { logger } from './utils/logger';
import { RankingScheduler } from './schedulers/ranking.scheduler';
import { config } from './config';

// Create scheduler instance
const scheduler = new RankingScheduler();

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal} signal, starting graceful shutdown`);
  
  try {
    // Stop the scheduler
    scheduler.stop();
    
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
    logger.info('Starting MKT-RANK application', {
      environment: config.environment,
      nodeVersion: process.version,
    });

    // Start the scheduler
    scheduler.start();

    // Log scheduler status
    const status = scheduler.getStatus();
    logger.info('Scheduler status', status);

    // Keep the process running
    logger.info('MKT-RANK application is running');
    
    // In production, you might want to add health check endpoints here
    // For now, we'll just keep the process alive
    
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
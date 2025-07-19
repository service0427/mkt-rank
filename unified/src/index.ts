#!/usr/bin/env node

import { startServer } from './web/server';
import { startSyncWorker } from './sync';
import { logger } from './utils/logger';

const mode = process.argv[2] || 'all';

async function main() {
  logger.info(`Starting Unified System in ${mode} mode`);

  try {
    switch (mode) {
      case 'web':
        // 웹 서버만 실행
        await startServer();
        break;
      
      case 'sync':
        // 동기화 워커만 실행
        await startSyncWorker();
        break;
      
      case 'all':
      default:
        // 모든 서비스 실행
        await Promise.all([
          startServer(),
          startSyncWorker()
        ]);
        break;
    }
  } catch (error) {
    logger.error('Failed to start unified system:', error);
    process.exit(1);
  }
}

// 프로세스 종료 처리
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// 메인 함수 실행
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
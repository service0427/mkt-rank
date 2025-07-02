#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { KeywordSyncService } from './services/sync/keyword-sync.service';
import { logger } from './utils/logger';

/**
 * 키워드 동기화 크론 작업
 * 실행 시간: 매시 50분, 55분
 * 
 * 사용법:
 * - 실제 실행: node dist/cron-keyword-sync.js
 * - 테스트 실행: node dist/cron-keyword-sync.js --dry-run
 */
async function runKeywordSync() {
  const isDryRun = process.argv.includes('--dry-run');
  const startTime = Date.now();
  
  console.log('=== Starting Keyword Sync Cron Job ===');
  console.log(`Current time: ${new Date().toISOString()}`);
  if (isDryRun) {
    console.log('>>> DRY RUN MODE - 실제로 추가되지 않습니다 <<<');
  }
  
  logger.info('=== Starting Keyword Sync Cron Job ===');
  logger.info(`Current time: ${new Date().toISOString()}`);
  if (isDryRun) {
    logger.info('>>> DRY RUN MODE - 실제로 추가되지 않습니다 <<<');
  }

  try {
    const syncService = new KeywordSyncService();
    await syncService.syncMissingKeywords(isDryRun);

    const duration = Date.now() - startTime;
    logger.info(`=== Keyword Sync Completed in ${duration}ms ===`);
  } catch (error) {
    logger.error('=== Keyword Sync Failed ===', error);
    process.exit(1);
  }
}

// 즉시 실행
runKeywordSync().catch(error => {
  logger.error('Unhandled error in keyword sync:', error);
  process.exit(1);
});
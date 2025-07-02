#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import { KeywordSyncService } from './services/sync/keyword-sync.service';
import { logger } from './utils/logger';

/**
 * 키워드 동기화 DRY RUN 테스트
 * 실제로 키워드를 추가하지 않고 어떤 키워드가 추가될지만 확인
 */
async function testDryRun() {
  logger.info('=== 키워드 동기화 DRY RUN 테스트 ===');
  logger.info('실제로 키워드가 추가되지 않습니다.\n');

  try {
    const syncService = new KeywordSyncService();
    
    // DRY RUN 모드로 실행
    await syncService.syncMissingKeywords(true);
    
    logger.info('\n=== DRY RUN 완료 ===');
    logger.info('위의 키워드들이 실제 동기화 시 추가될 예정입니다.');
    logger.info('실제로 추가하려면: node dist/cron-keyword-sync.js');
  } catch (error) {
    logger.error('DRY RUN 실패:', error);
  }
}

// 실행
testDryRun().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
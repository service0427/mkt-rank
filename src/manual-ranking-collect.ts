import dotenv from 'dotenv';
dotenv.config();

import { KeywordService } from './services/keyword/keyword.service';
import { addKeywordToQueue, getQueueStatus } from './queues/ranking-queue';
import { RankingWorker } from './workers/ranking-worker';
import { queueMonitor } from './queues/queue-monitor';
import { logger } from './utils/logger';

async function manualRankingCollect() {
  logger.info('Starting manual ranking collection...');
  
  const keywordService = new KeywordService();
  const rankingWorker = new RankingWorker();
  
  try {
    // 워커 시작
    await rankingWorker.start();
    logger.info('Ranking worker started');
    
    // 활성 키워드 가져오기
    const keywords = await keywordService.getActiveKeywords();
    logger.info(`Found ${keywords.length} active keywords to collect`);
    
    if (keywords.length === 0) {
      logger.info('No keywords to collect, exiting...');
      return;
    }
    
    // 모니터링 시작
    queueMonitor.startCollection(keywords.length);
    
    // 키워드들을 큐에 추가
    let addedCount = 0;
    for (const keyword of keywords) {
      const priority = keyword.priority || 0;
      const job = await addKeywordToQueue(keyword.keyword, priority);
      if (job) {
        addedCount++;
      }
    }
    
    logger.info(`Added ${addedCount} keywords to queue`);
    
    // 큐 상태 확인
    const queueStatus = await getQueueStatus();
    logger.info('Queue status:', queueStatus);
    
    // 모든 작업이 완료될 때까지 대기
    let isComplete = false;
    while (!isComplete) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크
      
      const currentStatus = await getQueueStatus();
      logger.info(`Queue status: waiting=${currentStatus.waiting}, active=${currentStatus.active}, completed=${currentStatus.completed}, failed=${currentStatus.failed}`);
      
      if (currentStatus.waiting === 0 && currentStatus.active === 0) {
        isComplete = true;
        logger.info('All collection tasks completed');
      }
    }
    
  } catch (error) {
    logger.error('Manual ranking collection failed:', error);
  } finally {
    // 워커 종료
    await rankingWorker.stop();
    logger.info('Manual ranking collection finished');
    process.exit(0);
  }
}

manualRankingCollect();
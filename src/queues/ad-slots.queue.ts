import Bull from 'bull';
import { adSlotsConfig } from '../config/ad-slots.config';
import { AdSlotJobData } from '../types/ad-slots.types';
import { AdSlotService } from '../services/ad-slots/ad-slot.service';
import { AdSlotRankingService } from '../services/ad-slots/ad-slot-ranking.service';
import { AdSlotUpdateService } from '../services/ad-slots/ad-slot-update.service';
import { logger } from '../utils/logger';

// Queue 생성 (별도 Redis DB 사용)
export const adSlotsQueue = new Bull<AdSlotJobData>('ad-slots-queue', {
  redis: {
    host: adSlotsConfig.redis.host,
    port: adSlotsConfig.redis.port,
    password: adSlotsConfig.redis.password,
    db: adSlotsConfig.redis.db, // 별도 DB 번호 (기본은 2)
  },
  defaultJobOptions: {
    removeOnComplete: 100, // 완료된 작업 100개만 유지
    removeOnFail: 50, // 실패한 작업 50개만 유지
    attempts: adSlotsConfig.queue.maxRetries,
    backoff: {
      type: 'fixed',
      delay: adSlotsConfig.queue.retryDelay,
    },
  },
});

// Services
const adSlotService = new AdSlotService();
const rankingService = new AdSlotRankingService();
const updateService = new AdSlotUpdateService();

// Worker 초기화 여부
let isInitialized = false;

/**
 * Worker 초기화
 */
export async function initializeAdSlotsWorker(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    await rankingService.initialize();
    isInitialized = true;
    logger.info('AdSlots worker initialized');
  } catch (error) {
    logger.error('Failed to initialize AdSlots worker:', error);
    throw error;
  }
}

/**
 * Queue 프로세서
 */
adSlotsQueue.process('collect-ranking', adSlotsConfig.queue.concurrency, async (job) => {
  const { adSlot } = job.data;
  
  try {
    logger.info(`Processing ad_slot ${adSlot.ad_slot_id}`, {
      keyword: adSlot.work_keyword,
      jobId: job.id,
    });

    // 1. 순위 수집 (3페이지 검색, MID 매칭)
    const rankingResult = await rankingService.collectSingleSlotRanking(adSlot);

    // 2. MySQL 업데이트
    await updateService.updateSlotRankings(rankingResult);

    // 3. 시간별 요약 업데이트
    if (rankingResult.is_found) {
      await rankingService.updateHourlySummary(adSlot.ad_slot_id, adSlot.work_keyword || '');
    }

    // 진행률 업데이트
    await job.progress(100);

    logger.info(`Completed processing ad_slot ${adSlot.ad_slot_id}`, {
      keyword: adSlot.work_keyword,
      found: rankingResult.is_found,
      priceRank: rankingResult.price_rank,
      storeRank: rankingResult.store_rank,
    });

    return rankingResult;

  } catch (error) {
    logger.error(`Failed to process ad_slot ${adSlot.ad_slot_id}:`, error);
    throw error;
  }
});

/**
 * 모든 활성 슬롯을 큐에 추가
 */
export async function enqueueAllActiveSlots(): Promise<{
  totalSlots: number;
  queuedSlots: number;
  skippedSlots: number;
}> {
  try {
    const activeSlots = await adSlotService.getActiveSlots();
    logger.info(`Found ${activeSlots.length} active slots to process`);

    let queuedCount = 0;
    let skippedCount = 0;

    // 배치로 큐에 추가
    const batchSize = 100;
    for (let i = 0; i < activeSlots.length; i += batchSize) {
      const batch = activeSlots.slice(i, i + batchSize);
      
      const jobs = batch.map(slot => ({
        name: 'collect-ranking' as const,
        data: {
          adSlot: slot,
          priority: slot.rank_check_date ? 10 : 5, // 체크 안 한 슬롯 우선
        },
        opts: {
          priority: slot.rank_check_date ? 10 : 5,
          delay: i * 100, // 배치 간 딜레이
        },
      }));

      await adSlotsQueue.addBulk(jobs);
      queuedCount += jobs.length;
    }

    logger.info(`Enqueued ${queuedCount} slots for processing`);

    return {
      totalSlots: activeSlots.length,
      queuedSlots: queuedCount,
      skippedSlots: skippedCount,
    };
  } catch (error) {
    logger.error('Failed to enqueue active slots:', error);
    throw error;
  }
}

/**
 * 특정 슬롯을 큐에 추가
 */
export async function enqueueSingleSlot(adSlotId: number): Promise<void> {
  try {
    const slot = await adSlotService.getSlotById(adSlotId);
    if (!slot) {
      throw new Error(`Slot ${adSlotId} not found`);
    }

    if (slot.status !== 'ACTIVE' || !slot.is_active) {
      throw new Error(`Slot ${adSlotId} is not active`);
    }

    await adSlotsQueue.add('collect-ranking', {
      adSlot: slot,
      priority: 1, // 수동 요청은 최우선
    }, {
      priority: 1,
    });

    logger.info(`Enqueued single slot ${adSlotId} for processing`);
  } catch (error) {
    logger.error(`Failed to enqueue slot ${adSlotId}:`, error);
    throw error;
  }
}

/**
 * Queue 상태 조회
 */
export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    adSlotsQueue.getWaitingCount(),
    adSlotsQueue.getActiveCount(),
    adSlotsQueue.getCompletedCount(),
    adSlotsQueue.getFailedCount(),
    adSlotsQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Queue 정리
 */
export async function cleanQueue(): Promise<void> {
  await adSlotsQueue.clean(24 * 60 * 60 * 1000); // 24시간 이상 된 작업 삭제
  await adSlotsQueue.clean(24 * 60 * 60 * 1000, 'failed'); // 24시간 이상 된 실패 작업 삭제
  logger.info('Cleaned old jobs from ad-slots queue');
}

// Queue 이벤트 리스너
adSlotsQueue.on('completed', (job) => {
  logger.debug(`Job ${job.id} completed`, {
    adSlotId: job.data.adSlot.ad_slot_id,
    keyword: job.data.adSlot.work_keyword,
  });
});

adSlotsQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed`, {
    adSlotId: job.data.adSlot.ad_slot_id,
    keyword: job.data.adSlot.work_keyword,
    error: err.message,
  });
});

adSlotsQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`, {
    adSlotId: job.data.adSlot.ad_slot_id,
    keyword: job.data.adSlot.work_keyword,
  });
});
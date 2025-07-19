import { Router, Request, Response, NextFunction } from 'express';
import { adSlotsConfig } from '../config/ad-slots.config';
import { AdSlotService } from '../services/ad-slots/ad-slot.service';
import { AdSlotUpdateService } from '../services/ad-slots/ad-slot-update.service';
import { AdSlotScalingService } from '../services/ad-slots/ad-slot-scaling.service';
import {
  enqueueAllActiveSlots,
  enqueueSingleSlot,
  getQueueStatus,
  cleanQueue,
} from '../queues/ad-slots.queue';
import { logger } from '../utils/logger';

const router = Router();

// Services
const adSlotService = new AdSlotService();
const updateService = new AdSlotUpdateService();
const scalingService = new AdSlotScalingService();

// Middleware to check if AD_SLOTS is enabled
const checkEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (!adSlotsConfig.enabled) {
    res.status(503).json({
      error: 'AD_SLOTS feature is disabled',
      message: 'Set AD_SLOTS_ENABLED=true to enable this feature',
    });
    return;
  }
  next();
};

// Apply middleware to all routes
router.use(checkEnabled);

/**
 * GET /api/ad-slots/status
 * 전체 시스템 상태 조회
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [queueStatus, activeCount, stats] = await Promise.all([
      getQueueStatus(),
      adSlotService.getActiveSlotsCount(),
      updateService.getUpdateStats(),
    ]);

    res.json({
      enabled: adSlotsConfig.enabled,
      config: {
        maxPages: adSlotsConfig.schedule.maxPages,
        batchSize: adSlotsConfig.schedule.batchSize,
        concurrency: adSlotsConfig.queue.concurrency,
        schedule: adSlotsConfig.schedule.cron,
      },
      queue: queueStatus,
      database: {
        activeSlots: activeCount,
        ...stats,
      },
    });
  } catch (error) {
    logger.error('Failed to get ad-slots status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * POST /api/ad-slots/collect
 * 모든 활성 슬롯 수집 시작 (수동 트리거)
 */
router.post('/collect', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await enqueueAllActiveSlots();
    res.json({
      message: 'Collection started',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to start collection:', error);
    res.status(500).json({ error: 'Failed to start collection' });
  }
});

/**
 * POST /api/ad-slots/collect/:id
 * 특정 슬롯 수집 (수동)
 */
router.post('/collect/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const adSlotId = parseInt(req.params.id);
    if (isNaN(adSlotId)) {
      res.status(400).json({ error: 'Invalid ad_slot_id' });
      return;
    }

    await enqueueSingleSlot(adSlotId);
    res.json({
      message: `Collection started for ad_slot ${adSlotId}`,
      ad_slot_id: adSlotId,
    });
  } catch (error) {
    logger.error(`Failed to collect slot ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to start collection' });
  }
});

/**
 * GET /api/ad-slots/slots
 * 활성 슬롯 목록 조회
 */
router.get('/slots', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const slots = await adSlotService.getActiveSlots(limit);
    
    res.json({
      total: slots.length,
      limit,
      slots: slots.map(slot => ({
        ad_slot_id: slot.ad_slot_id,
        work_keyword: slot.work_keyword,
        price_rank: slot.price_rank,
        store_rank: slot.store_rank,
        price_rank_diff: slot.price_rank_diff,
        store_rank_diff: slot.store_rank_diff,
        rank_check_date: slot.rank_check_date,
        status: slot.status,
      })),
    });
  } catch (error) {
    logger.error('Failed to get slots:', error);
    res.status(500).json({ error: 'Failed to get slots' });
  }
});

/**
 * GET /api/ad-slots/slots/:id
 * 특정 슬롯 상세 조회
 */
router.get('/slots/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const adSlotId = parseInt(req.params.id);
    if (isNaN(adSlotId)) {
      res.status(400).json({ error: 'Invalid ad_slot_id' });
      return;
    }

    const slot = await adSlotService.getSlotById(adSlotId);
    if (!slot) {
      res.status(404).json({ error: 'Slot not found' });
      return;
    }

    res.json(slot);
  } catch (error) {
    logger.error(`Failed to get slot ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to get slot' });
  }
});

/**
 * GET /api/ad-slots/priority
 * 우선순위 높은 슬롯 조회
 */
router.get('/priority', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const slots = await adSlotService.getPrioritySlots(limit);
    
    res.json({
      total: slots.length,
      limit,
      slots: slots.map(slot => ({
        ad_slot_id: slot.ad_slot_id,
        work_keyword: slot.work_keyword,
        rank_check_date: slot.rank_check_date,
        price_rank_diff: slot.price_rank_diff,
        store_rank_diff: slot.store_rank_diff,
        priority_score: Math.abs(slot.price_rank_diff || 0) + Math.abs(slot.store_rank_diff || 0),
      })),
    });
  } catch (error) {
    logger.error('Failed to get priority slots:', error);
    res.status(500).json({ error: 'Failed to get priority slots' });
  }
});

/**
 * POST /api/ad-slots/queue/clean
 * 큐 정리 (오래된 작업 삭제)
 */
router.post('/queue/clean', async (_req: Request, res: Response): Promise<void> => {
  try {
    await cleanQueue();
    const status = await getQueueStatus();
    
    res.json({
      message: 'Queue cleaned',
      queue: status,
    });
  } catch (error) {
    logger.error('Failed to clean queue:', error);
    res.status(500).json({ error: 'Failed to clean queue' });
  }
});

/**
 * GET /api/ad-slots/keywords
 * 키워드별 슬롯 그룹 조회
 */
router.get('/keywords', async (_req: Request, res: Response): Promise<void> => {
  try {
    const keywordMap = await adSlotService.getSlotsByKeyword();
    
    const keywords = Array.from(keywordMap.entries()).map(([keyword, slots]) => ({
      keyword,
      slot_count: slots.length,
      slot_ids: slots.map(s => s.ad_slot_id),
    }));

    res.json({
      total_keywords: keywords.length,
      total_slots: keywords.reduce((sum, k) => sum + k.slot_count, 0),
      keywords: keywords.sort((a, b) => b.slot_count - a.slot_count),
    });
  } catch (error) {
    logger.error('Failed to get keywords:', error);
    res.status(500).json({ error: 'Failed to get keywords' });
  }
});

/**
 * POST /api/ad-slots/reset/:id
 * 특정 슬롯의 순위 초기화
 */
router.post('/reset/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const adSlotId = parseInt(req.params.id);
    if (isNaN(adSlotId)) {
      res.status(400).json({ error: 'Invalid ad_slot_id' });
      return;
    }

    await updateService.resetRankings(adSlotId);
    res.json({
      message: `Rankings reset for ad_slot ${adSlotId}`,
      ad_slot_id: adSlotId,
    });
  } catch (error) {
    logger.error(`Failed to reset slot ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to reset rankings' });
  }
});

/**
 * GET /api/ad-slots/scaling-status
 * 스케일링 상태 및 권장사항 조회
 */
router.get('/scaling-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await scalingService.getScalingStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to get scaling status:', error);
    res.status(500).json({ error: 'Failed to get scaling status' });
  }
});

export default router;
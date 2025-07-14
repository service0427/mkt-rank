import { Router } from 'express';
import { CoupangInstantRankingService } from '../services/ranking/coupang-instant-ranking.service';
import { CoupangRankingService } from '../services/ranking/coupang-ranking.service';
import { CoupangDataSyncService } from '../services/sync/coupang-data-sync.service';
import { LocalPostgresService } from '../services/database/local-postgres.service';
import { SupabaseService } from '../services/database/supabase.service';
import { KeywordService } from '../services/keyword/keyword.service';
import { logger } from '../utils/logger';

const router = Router();
const instantRankingService = new CoupangInstantRankingService();
const coupangRankingService = new CoupangRankingService();
const keywordService = new KeywordService();

/**
 * 쿠팡 단일 키워드 체크 및 순위 수집
 */
router.post('/check', async (req, res): Promise<void> => {
  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      res.status(400).json({
        success: false,
        error: '키워드가 필요합니다'
      });
      return;
    }

    logger.info(`Coupang check request for keyword: ${keyword}`);
    const result = await instantRankingService.checkKeyword(keyword);

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Coupang keyword check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '키워드 체크 중 오류가 발생했습니다'
    });
  }
});

/**
 * 쿠팡 다중 키워드 체크 및 순위 수집
 */
router.post('/check-multiple', async (req, res): Promise<void> => {
  try {
    const { keywords } = req.body;

    if (!keywords || !Array.isArray(keywords)) {
      res.status(400).json({
        success: false,
        error: '키워드 배열이 필요합니다'
      });
      return;
    }

    if (keywords.length === 0) {
      res.status(400).json({
        success: false,
        error: '최소 1개 이상의 키워드가 필요합니다'
      });
      return;
    }

    if (keywords.length > 100) {
      res.status(400).json({
        success: false,
        error: '한 번에 최대 100개까지 처리 가능합니다'
      });
      return;
    }

    logger.info(`Coupang multiple check request for ${keywords.length} keywords`);
    const results = await instantRankingService.checkMultipleKeywords(keywords);

    const summary = {
      total: results.length,
      new: results.filter(r => r.isNew).length,
      existing: results.filter(r => !r.isNew && !r.error).length,
      errors: results.filter(r => r.error).length
    };

    res.json({
      success: true,
      summary,
      results
    });
  } catch (error: any) {
    logger.error('Coupang multiple keywords check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '키워드 체크 중 오류가 발생했습니다'
    });
  }
});

/**
 * 쿠팡 키워드 상태 확인
 */
router.get('/status/:keyword', async (req, res): Promise<void> => {
  try {
    const { keyword } = req.params;

    if (!keyword) {
      res.status(400).json({
        success: false,
        error: '키워드가 필요합니다'
      });
      return;
    }

    const status = await instantRankingService.getKeywordStatus(keyword);
    res.json({
      success: true,
      status
    });
  } catch (error: any) {
    logger.error('Coupang keyword status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '상태 확인 중 오류가 발생했습니다'
    });
  }
});

/**
 * 쿠팡 로켓배송 상품만 검색
 */
router.post('/check-rocket', async (req, res): Promise<void> => {
  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      res.status(400).json({
        success: false,
        error: '키워드가 필요합니다'
      });
      return;
    }

    logger.info(`Coupang rocket delivery check for keyword: ${keyword}`);
    const result = await instantRankingService.checkRocketDeliveryKeyword(keyword);

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Coupang rocket delivery check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '로켓배송 체크 중 오류가 발생했습니다'
    });
  }
});

/**
 * 쿠팡 전체 키워드 수동 수집 및 싱크
 */
router.post('/collect-all', async (_req, res): Promise<void> => {
  try {
    logger.info('Starting manual Coupang keywords collection and sync');
    
    // type='cp'인 활성 키워드 가져오기
    const keywords = await keywordService.getActiveKeywords('cp');
    
    if (keywords.length === 0) {
      res.json({
        success: false,
        message: 'No active Coupang keywords found',
        totalKeywords: 0
      });
      return;
    }

    // 비동기로 수집 시작
    res.json({
      success: true,
      message: `Started collecting ${keywords.length} Coupang keywords`,
      totalKeywords: keywords.length
    });

    // 백그라운드에서 수집 진행
    collectAndSyncCoupangKeywords(keywords);
    
  } catch (error: any) {
    logger.error('Coupang manual collection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '수동 수집 중 오류가 발생했습니다'
    });
  }
});

/**
 * 쿠팡 키워드 수집 후 싱크
 */
async function collectAndSyncCoupangKeywords(keywords: any[]) {
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  try {
    logger.info(`Starting collection for ${keywords.length} Coupang keywords`);

    // 각 키워드 수집
    for (const keyword of keywords) {
      try {
        await coupangRankingService.collectKeywordRankings(keyword);
        successCount++;
        
        // API 속도 제한 방지를 위한 랜덤 딜레이 (2-15초)
        const delay = 2000 + Math.floor(Math.random() * 13000);
        logger.info(`Coupang API delay: ${delay}ms (${Math.round(delay/1000)}s) between keywords`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        errorCount++;
        logger.error(`Failed to collect Coupang keyword: ${keyword.keyword}`, error);
      }
    }

    logger.info(`Coupang collection completed: ${successCount} success, ${errorCount} errors`);

    // 전체 싱크 실행
    logger.info('Starting Coupang data sync...');
    const localDb = new LocalPostgresService();
    const supabase = new SupabaseService();
    const syncService = new CoupangDataSyncService(localDb, supabase);
    
    const keywordIds = keywords.map(k => k.id);
    
    // Current rankings sync
    await syncService.syncCurrentRankings(keywordIds);
    
    // Hourly sync
    await syncService.syncHourlySnapshots(keywordIds);
    
    // Daily sync (if it's midnight KST)
    const now = new Date();
    if (now.getHours() === 15 && now.getMinutes() === 0) {
      await syncService.syncDailySnapshots(keywordIds);
    }
    
    await localDb.cleanup();
    
    const duration = Date.now() - startTime;
    logger.info(`Coupang manual collection and sync completed in ${duration}ms`);
    
  } catch (error) {
    logger.error('Coupang collection and sync failed:', error);
  }
}

/**
 * 쿠팡 싱크만 수동 실행
 */
router.post('/sync-only', async (_req, res): Promise<void> => {
  try {
    logger.info('Starting manual Coupang sync only');
    
    const localDb = new LocalPostgresService();
    const supabase = new SupabaseService();
    const syncService = new CoupangDataSyncService(localDb, supabase);
    
    // type='cp'인 활성 키워드 가져오기
    const keywords = await keywordService.getActiveKeywords('cp');
    
    if (keywords.length === 0) {
      res.json({
        success: false,
        message: 'No active Coupang keywords found',
        totalKeywords: 0
      });
      return;
    }
    
    const keywordIds = keywords.map(k => k.id);
    
    // Current rankings sync
    await syncService.syncCurrentRankings(keywordIds);
    
    // Hourly sync
    await syncService.syncHourlySnapshots(keywordIds);
    
    // Daily sync check
    const now = new Date();
    if (now.getHours() === 15) {
      await syncService.syncDailySnapshots(keywordIds);
    }
    
    await localDb.cleanup();
    
    res.json({
      success: true,
      message: `Synced ${keywords.length} Coupang keywords`,
      totalKeywords: keywords.length,
      syncTypes: {
        current: true,
        hourly: true,
        daily: now.getHours() === 15
      }
    });
    
  } catch (error: any) {
    logger.error('Coupang manual sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '수동 싱크 중 오류가 발생했습니다'
    });
  }
});

export default router;
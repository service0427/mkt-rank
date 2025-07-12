import { Router } from 'express';
import { CoupangInstantRankingService } from '../services/ranking/coupang-instant-ranking.service';
import { logger } from '../utils/logger';

const router = Router();
const instantRankingService = new CoupangInstantRankingService();

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

export default router;
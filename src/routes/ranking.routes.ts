import express from 'express';
import { InstantRankingService } from '../services/ranking/instant-ranking.service';
import { logger } from '../utils/logger';

const router = express.Router();
const instantRankingService = new InstantRankingService();

/**
 * POST /api/ranking/check
 * 단일 키워드 체크 및 순위 수집
 */
router.post('/check', async (req, res) => {
  const { keyword } = req.body;
  
  if (!keyword || typeof keyword !== 'string') {
    res.status(400).json({
      success: false,
      error: '키워드를 입력해주세요'
    });
    return;
  }
  
  try {
    const result = await instantRankingService.checkKeyword(keyword);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error: any) {
    logger.error('Keyword check failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || '키워드 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * POST /api/ranking/check-multiple
 * 다중 키워드 체크 및 순위 수집
 */
router.post('/check-multiple', async (req, res) => {
  const { keywords } = req.body;
  
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    res.status(400).json({
      success: false,
      error: '키워드 배열을 입력해주세요'
    });
    return;
  }
  
  // 최대 100개 제한
  if (keywords.length > 100) {
    res.status(400).json({
      success: false,
      error: '한 번에 최대 100개의 키워드만 처리 가능합니다'
    });
    return;
  }
  
  try {
    const results = await instantRankingService.checkMultipleKeywords(keywords);
    
    res.json({
      success: true,
      data: results,
      summary: {
        total: results.length,
        new: results.filter(r => r.isNew).length,
        existing: results.filter(r => !r.isNew && !r.error).length,
        errors: results.filter(r => r.error).length
      }
    });
    
  } catch (error: any) {
    logger.error('Multiple keywords check failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || '키워드 처리 중 오류가 발생했습니다'
    });
  }
});

export default router;
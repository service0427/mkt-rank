// Rankings API Routes
import { Router, Request, Response } from 'express';
import * as rankingsController from '../../controllers/rankings.controller';

const router = Router();

// GET /api/rankings - Get rankings with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const rankings = await rankingsController.getCurrentRankings(req.query as any);
    res.json({ success: true, data: rankings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch rankings' });
  }
});

// GET /api/rankings/history/:keyword_id - Get ranking history for a specific keyword
router.get('/history/:keyword_id', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    
    const history = await rankingsController.getRankingHistory(
      req.params.keyword_id, 
      parseInt(days as string)
    );
    
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch ranking history' });
  }
});

// POST /api/rankings/collect - Trigger ranking collection
router.post('/collect', async (req: Request, res: Response) => {
  try {
    const { service_id, keyword_ids } = req.body;
    
    const result = await rankingsController.triggerCollection(service_id, keyword_ids);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to start ranking collection' });
  }
});

// GET /api/rankings/stats/:keyword_id - Get keyword statistics
router.get('/stats/:keyword_id', async (req: Request, res: Response) => {
  try {
    const stats = await rankingsController.getKeywordStats(req.params.keyword_id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch keyword stats' });
  }
});

// GET /api/rankings/product-stats/:keyword_id/:product_id - Get product ranking statistics
router.get('/product-stats/:keyword_id/:product_id', async (req: Request, res: Response) => {
  try {
    const stats = await rankingsController.getProductStats(
      req.params.keyword_id,
      req.params.product_id
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product stats' });
  }
});

// GET /api/rankings/product-history/:keyword_id/:product_id - Get product ranking history
router.get('/product-history/:keyword_id/:product_id', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const history = await rankingsController.getProductRankingHistory(
      req.params.keyword_id,
      req.params.product_id,
      parseInt(days as string)
    );
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch product ranking history' });
  }
});

export { router as rankingsRouter };
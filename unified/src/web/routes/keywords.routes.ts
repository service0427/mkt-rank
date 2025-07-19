// Keywords API Routes
import { Router, Request, Response } from 'express';
import * as keywordsController from '../../controllers/keywords.controller';

const router = Router();

// GET /api/keywords - Get keywords with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const keywords = await keywordsController.getKeywords(req.query);
    res.json(keywords);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch keywords' });
  }
});

// POST /api/keywords - Create new keyword
router.post('/', async (req: Request, res: Response) => {
  try {
    const keyword = await keywordsController.createKeyword(req.body);
    res.status(201).json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create keyword' });
  }
});

// PUT /api/keywords/:id - Update keyword
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const keyword = await keywordsController.updateKeyword(req.params.id, req.body);
    res.json({ success: true, data: keyword });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update keyword' });
  }
});

// DELETE /api/keywords/:id - Delete keyword
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await keywordsController.deleteKeyword(req.params.id);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete keyword' });
  }
});

// POST /api/keywords/import - Import keywords from CSV
router.post('/import', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement CSV import
    res.json({ success: true, message: 'Import not implemented' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Import failed' });
  }
});

// GET /api/keywords/export - Export keywords to CSV
router.get('/export', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement CSV export
    res.json({ success: true, message: 'Export not implemented' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

export { router as keywordsRouter };
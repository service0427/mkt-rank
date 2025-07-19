// API Keys Routes
import { Router, Request, Response } from 'express';

const router = Router();

// Redirect to existing API key management system
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Redirect to existing API key management at port 3001
    res.redirect('http://localhost:3001/api-keys');
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to redirect' });
  }
});

export { router as apiKeysRouter };
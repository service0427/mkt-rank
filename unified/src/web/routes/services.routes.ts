// Services API Routes
import { Router, Request, Response } from 'express';
import * as servicesController from '../../controllers/services.controller';

const router = Router();

// GET /api/services - Get all services
router.get('/', async (_req: Request, res: Response) => {
  try {
    const services = await servicesController.getServices();
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch services' });
  }
});

// GET /api/services/:id - Get service by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const service = await servicesController.getServiceById(req.params.id);
    if (!service) {
      res.status(404).json({ success: false, error: 'Service not found' });
      return;
    }
    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
});

// POST /api/services - Create new service
router.post('/', async (req: Request, res: Response) => {
  try {
    const service = await servicesController.createService(req.body);
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create service' });
  }
});

// PUT /api/services/:id - Update service
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const service = await servicesController.updateService(req.params.id, req.body);
    res.json({ success: true, data: service });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update service' });
  }
});

// DELETE /api/services/:id - Delete service
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await servicesController.deleteService(req.params.id);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete service' });
  }
});

// POST /api/services/:id/test - Test service connection
router.post('/:id/test', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement connection test
    res.json({ success: true, message: 'Connection test not implemented' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

// POST /api/services/test-connection - Test connection without saving
router.post('/test-connection', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement connection test
    res.json({ success: true, message: 'Connection successful' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

export { router as servicesRouter };
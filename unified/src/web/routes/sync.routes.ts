// Sync API Routes
import { Router, Request, Response } from 'express';
import { query } from '../../db/postgres';
import { syncWorker } from '../../sync/worker';

const router = Router();

// GET /api/sync/status - Get sync status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Get today's sync stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [stats] = await query<any>(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'running') as active_jobs,
        COUNT(*) FILTER (WHERE status = 'success' AND started_at >= $1) as completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND started_at >= $1) as failed_today
      FROM unified_sync_logs
    `, [today]);
    
    // Get next scheduled sync
    const [nextSync] = await query<any>(`
      SELECT MIN(next_run_at) as next_sync
      FROM unified_services
      WHERE is_active = true AND sync_config IS NOT NULL
    `);
    
    const status = {
      activeJobs: parseInt(stats?.active_jobs || '0'),
      completedToday: parseInt(stats?.completed_today || '0'),
      failedToday: parseInt(stats?.failed_today || '0'),
      nextSync: nextSync?.next_sync || new Date(Date.now() + 60 * 60 * 1000)
    };
    
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sync status' });
  }
});

// POST /api/sync/trigger/all - Trigger sync for all services
router.post('/trigger/all', async (_req: Request, res: Response) => {
  try {
    const services = await query<any>(`
      SELECT * FROM unified_services 
      WHERE is_active = true
    `);
    
    let triggered = 0;
    for (const service of services) {
      await syncWorker['syncService'](service);
      triggered++;
    }
    
    res.json({ 
      success: true, 
      message: `전체 동기화가 시작되었습니다. (${triggered}개 서비스)`,
      count: triggered 
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger sync' });
  }
});

// POST /api/sync/trigger/:service - Trigger manual sync for specific service
router.post('/trigger/:service', async (req: Request, res: Response) => {
  try {
    const serviceId = req.params.service;
    
    const [service] = await query<any>(`
      SELECT * FROM unified_services 
      WHERE service_id = $1 AND is_active = true
    `, [serviceId]);
    
    if (!service) {
      res.status(404).json({ success: false, error: 'Service not found or inactive' });
      return;
    }
    
    await syncWorker['syncService'](service);
    
    res.json({ 
      success: true, 
      message: `${service.service_name} 동기화가 시작되었습니다.` 
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger sync' });
  }
});

// GET /api/sync/logs - Get sync logs
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const logs = await query<any>(`
      SELECT 
        l.*,
        s.service_name
      FROM unified_sync_logs l
      LEFT JOIN unified_services s ON l.service_id = s.service_id
      ORDER BY l.started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sync logs' });
  }
});

// PUT /api/sync/config/:service - Update sync config
router.put('/config/:service', async (_req: Request, res: Response) => {
  try {
    // TODO: Implement sync config update
    res.json({ success: true, message: 'Sync config updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update sync config' });
  }
});

// POST /api/sync/mysql-adslots - Trigger MySQL AD_SLOTS sync
router.post('/mysql-adslots', async (_req: Request, res: Response) => {
  try {
    const { MySQLAdSlotsSyncService } = await import('../../sync/mysql-adslots-sync');
    
    const mysqlConfig = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'magic_db'
    };

    const syncService = new MySQLAdSlotsSyncService(mysqlConfig);
    const result = await syncService.triggerSync();
    
    res.json(result);
  } catch (error) {
    console.error('MySQL AD_SLOTS sync error:', error);
    res.status(500).json({ success: false, error: 'Failed to sync MySQL AD_SLOTS' });
  }
});

// GET /api/sync/mysql-adslots/stats - Get MySQL AD_SLOTS sync stats
router.get('/mysql-adslots/stats', async (_req: Request, res: Response) => {
  try {
    const { MySQLAdSlotsSyncService } = await import('../../sync/mysql-adslots-sync');
    
    const mysqlConfig = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'magic_db'
    };

    const syncService = new MySQLAdSlotsSyncService(mysqlConfig);
    const stats = await syncService.getStats();
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('MySQL AD_SLOTS stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get MySQL AD_SLOTS stats' });
  }
});

export { router as syncRouter };
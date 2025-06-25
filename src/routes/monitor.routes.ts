import { Router } from 'express';
import { getQueueStatus } from '../queues/ranking-queue';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { FileLogger } from '../utils/file-logger';

const router = Router();

router.get('/queue-status', async (_req, res) => {
  try {
    const queueStatus = await getQueueStatus();
    res.json({
      success: true,
      data: queueStatus,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to get queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
    });
  }
});

router.get('/collection-history', async (_req, res) => {
  // api_usage 테이블 사용하지 않음 - 빈 데이터 반환
  res.json({
    success: true,
    data: {
      summary: {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgResponseTime: 0,
      },
      hourlyStats: {},
      recentErrors: [],
    },
    period: '24 hours',
    timestamp: new Date(),
  });
});

router.get('/keyword-performance', async (_req, res) => {
  try {
    const { data: keywords, error: keywordError } = await supabase
      .from('search_keywords')
      .select('*')
      .eq('is_active', true);

    if (keywordError) {
      logger.error('Failed to query keywords:', keywordError);
      throw keywordError;
    }

    const performanceData = [];

    for (const keyword of keywords || []) {
      const { data: recentRankings, error: rankingError } = await supabase
        .from('shopping_rankings_current')
        .select('created_at')
        .eq('keyword_id', keyword.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (rankingError) {
        logger.error(`Failed to get rankings for keyword ${keyword.keyword}:`, rankingError);
        continue;
      }

      let avgInterval = 0;
      if (recentRankings && recentRankings.length > 1) {
        const intervals = [];
        for (let i = 1; i < recentRankings.length; i++) {
          const interval = new Date(recentRankings[i-1].created_at).getTime() - 
                          new Date(recentRankings[i].created_at).getTime();
          intervals.push(interval);
        }
        avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      }

      performanceData.push({
        keyword: keyword.keyword,
        priority: keyword.priority || 0,
        lastCollection: recentRankings?.[0]?.created_at,
        totalCollections: recentRankings?.length || 0,
        avgCollectionInterval: Math.round(avgInterval / 1000 / 60), // minutes
      });
    }

    performanceData.sort((a, b) => b.priority - a.priority);

    res.json({
      success: true,
      data: performanceData,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to get keyword performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get keyword performance',
    });
  }
});

router.get('/system-health', async (_req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Database size query removed as it may not exist
    const dbSize = null;
    const dbError = null;

    const queueStatus = await getQueueStatus();

    res.json({
      success: true,
      data: {
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
        uptime: {
          seconds: Math.round(uptime),
          formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        },
        database: dbError ? null : dbSize,
        queue: queueStatus,
        environment: process.env.NODE_ENV,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to get system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system health',
    });
  }
});

router.get('/execution-logs', async (_req, res) => {
  try {
    const fileLogger = new FileLogger();
    const logs = fileLogger.getTodayLogs();
    const logFilePath = fileLogger.getLogFilePath();

    res.json({
      success: true,
      data: {
        logFile: logFilePath,
        totalEntries: logs.length,
        logs: logs.slice(-100), // Last 100 entries
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to get execution logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get execution logs',
    });
  }
});

router.post('/trigger-collection', async (_req, res) => {
  try {
    logger.info('Manual collection triggered via API');
    
    // Queue 스케줄러 인스턴스에 접근하기 위해 global 사용
    const scheduler = (global as any).rankingQueueScheduler;
    
    if (!scheduler) {
      res.status(500).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }
    
    // 수동으로 키워드 큐에 추가
    await scheduler.runManual();
    
    res.json({
      success: true,
      message: 'Collection triggered successfully',
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to trigger collection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger collection',
    });
  }
});

export default router;
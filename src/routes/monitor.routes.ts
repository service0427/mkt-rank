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

router.get('/collection-history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    const { data: apiUsage, error } = await supabase
      .from('api_usage')
      .select('*')
      .gte('created_at', cutoffTime.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    const successCount = apiUsage?.filter((u: any) => u.success).length || 0;
    const failureCount = apiUsage?.filter((u: any) => !u.success).length || 0;
    const avgResponseTime = apiUsage?.length 
      ? apiUsage.reduce((sum: number, u: any) => sum + (u.response_time || 0), 0) / apiUsage.length
      : 0;

    const hourlyStats: Record<string, any> = {};
    apiUsage?.forEach((usage: any) => {
      const hour = new Date(usage.created_at).getHours();
      if (!hourlyStats[hour]) {
        hourlyStats[hour] = { success: 0, failure: 0, avgTime: 0, count: 0 };
      }
      
      if (usage.success) {
        hourlyStats[hour].success++;
      } else {
        hourlyStats[hour].failure++;
      }
      
      hourlyStats[hour].avgTime += usage.response_time || 0;
      hourlyStats[hour].count++;
    });

    Object.keys(hourlyStats).forEach(hour => {
      hourlyStats[hour].avgTime = hourlyStats[hour].avgTime / hourlyStats[hour].count;
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalRequests: apiUsage?.length || 0,
          successCount,
          failureCount,
          successRate: apiUsage?.length ? (successCount / apiUsage.length * 100).toFixed(2) : 0,
          avgResponseTime: Math.round(avgResponseTime),
        },
        hourlyStats,
        recentErrors: apiUsage?.filter((u: any) => !u.success && u.error_message)
          .slice(0, 10)
          .map((u: any) => ({
            time: u.created_at,
            error: u.error_message,
            endpoint: u.endpoint,
          })),
      },
      period: `${hours} hours`,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to get collection history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get collection history',
    });
  }
});

router.get('/keyword-performance', async (_req, res) => {
  try {
    const { data: keywords, error: keywordError } = await supabase
      .from('shopping_keywords')
      .select('*')
      .eq('is_active', true);

    if (keywordError) throw keywordError;

    const performanceData = [];

    for (const keyword of keywords || []) {
      const { data: recentRankings, error: rankingError } = await supabase
        .from('shopping_rankings')
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

    const { data: dbSize, error: dbError } = await supabase
      .rpc('get_database_size');

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

export default router;
// Ranking Sync Worker - 순위 정보를 각 서비스로 동기화
import cron from 'node-cron';
import { query } from '../db/postgres';
import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { UnifiedService } from '../types';

interface RankingSyncConfig {
  sync_rankings?: boolean;
  ranking_sync_interval?: number;
  sync_current?: boolean;
  sync_hourly?: boolean;
  sync_daily?: boolean;
  ranking_platforms?: string[];
  mid_mapping?: {
    use_mid: boolean;
    mid_fields: string[];
  };
}

class RankingSyncWorker {
  private syncTasks: Map<string, cron.ScheduledTask> = new Map();

  async start() {
    console.log('Starting Ranking Sync Worker...');

    try {
      // 5분마다 현재 순위 동기화
      cron.schedule('*/5 * * * *', async () => {
        await this.syncCurrentRankings();
      });

      // 1시간마다 집계 데이터 동기화
      cron.schedule('0 * * * *', async () => {
        await this.syncAggregatedRankings();
      });

      console.log('Ranking Sync Worker started');
    } catch (error) {
      console.error('Failed to start Ranking Sync Worker:', error);
      throw error;
    }
  }

  async stop() {
    console.log('Stopping Ranking Sync Worker...');

    for (const [_, task] of this.syncTasks) {
      task.stop();
    }

    this.syncTasks.clear();
    console.log('Ranking Sync Worker stopped');
  }

  private async syncCurrentRankings() {
    console.log('Starting current rankings sync...');
    const startTime = Date.now();

    try {
      const services = await this.getActiveServices();

      for (const service of services) {
        const config = service.sync_config as RankingSyncConfig;
        if (config?.sync_rankings) {
          await this.syncServiceRankings(service);
        }
      }

      console.log(`Current rankings sync completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('Error syncing current rankings:', error);
    }
  }

  private async syncAggregatedRankings() {
    console.log('Starting aggregated rankings sync...');
    const startTime = Date.now();

    try {
      const services = await this.getActiveServices();

      for (const service of services) {
        const config = service.sync_config as RankingSyncConfig;
        if (config?.sync_rankings && 
            (config.sync_hourly || config.sync_daily)) {
          await this.syncServiceAggregatedRankings(service);
        }
      }

      console.log(`Aggregated rankings sync completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('Error syncing aggregated rankings:', error);
    }
  }

  private async getActiveServices(): Promise<UnifiedService[]> {
    const services = await query<UnifiedService>(`
      SELECT * FROM unified_services 
      WHERE is_active = true
      AND sync_config->>'sync_rankings' = 'true'
    `);
    return services;
  }

  private async syncServiceRankings(service: UnifiedService) {
    console.log(`Syncing rankings for service: ${service.service_name}`);
    
    const syncLogId = await this.createSyncLog(service.service_id, 'current');

    try {
      switch (service.db_type) {
        case 'supabase':
          await this.syncToSupabase(service);
          break;
        case 'mysql':
          await this.syncToMySQL(service);
          break;
        default:
          console.warn(`Unsupported db_type for ranking sync: ${service.db_type}`);
      }

      await this.updateSyncLog(syncLogId, 'success');
    } catch (error) {
      console.error(`Failed to sync rankings for ${service.service_name}:`, error);
      await this.updateSyncLog(syncLogId, 'failed', error);
    }
  }

  private async syncToSupabase(service: UnifiedService) {
    const config = service.connection_config as any;
    const supabase = createClient(config.url, config.key);

    // 해당 서비스의 최신 순위 데이터 조회
    const rankings = await query<any>(`
      SELECT 
        r.*,
        k.metadata->>'original_id' as supabase_keyword_id,
        sm.external_keyword_id
      FROM unified_rankings_current r
      JOIN unified_search_keywords k ON r.keyword_id = k.id
      LEFT JOIN unified_sync_mappings sm ON k.id = sm.unified_keyword_id 
        AND sm.service_id = $1
      WHERE k.service_id = $1 
      AND r.collected_at > NOW() - INTERVAL '10 minutes'
      AND r.platform = 'naver_shopping'
    `, [service.service_id]);

    if (rankings.length === 0) {
      console.log('No rankings to sync for Supabase');
      return;
    }

    // Batch upsert to Supabase
    const batchSize = 100;
    for (let i = 0; i < rankings.length; i += batchSize) {
      const batch = rankings.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('shopping_rankings_current')
        .upsert(batch.map(r => ({
          keyword_id: r.supabase_keyword_id || r.external_keyword_id,
          product_id: r.product_id,
          rank: r.rank,
          prev_rank: r.previous_rank,
          title: r.title,
          lprice: r.lprice,
          mall_name: r.mall_name,
          brand: r.brand,
          category1: r.category1,
          collected_at: r.collected_at,
          updated_at: new Date()
        })), {
          onConflict: 'keyword_id,product_id'
        });

      if (error) {
        console.error('Error syncing batch to Supabase:', error);
      }
    }

    console.log(`Synced ${rankings.length} rankings to Supabase`);
  }

  private async syncToMySQL(service: UnifiedService) {
    const config = service.connection_config as any;
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database
    });

    try {
      // AD_SLOTS의 키워드와 MID 정보 조회
      const [adSlots] = await connection.execute(`
        SELECT id, work_keyword, price_compare_mid, product_mid, seller_mid
        FROM ad_slots
        WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
      `);

      let updatedCount = 0;

      for (const slot of adSlots as any[]) {
        // 사용할 MID 결정 (우선순위: price_compare_mid > product_mid > seller_mid)
        const mid = slot.price_compare_mid || slot.product_mid || slot.seller_mid;
        if (!mid) continue;

        // Unified에서 해당 키워드와 MID의 순위 조회
        const [ranking] = await query<any>(`
          SELECT rank, previous_rank, collected_at
          FROM unified_rankings_current
          WHERE keyword = $1 
          AND product_id = $2
          AND platform = 'naver_shopping'
          ORDER BY collected_at DESC
          LIMIT 1
        `, [slot.work_keyword, mid]);

        if (ranking) {
          // MySQL 업데이트
          await connection.execute(`
            UPDATE ad_slots 
            SET current_rank = ?, 
                previous_rank = ?,
                rank_updated_at = ?
            WHERE id = ?
          `, [ranking.rank, ranking.previous_rank, ranking.collected_at, slot.id]);

          updatedCount++;
        }
      }

      console.log(`Updated ${updatedCount} ad_slots with ranking data`);

    } finally {
      await connection.end();
    }
  }

  private async syncServiceAggregatedRankings(service: UnifiedService) {
    // 시간별/일별 집계 데이터 동기화
    console.log(`Syncing aggregated rankings for service: ${service.service_name}`);
    
    // TODO: Implement hourly/daily sync
    // Similar to current rankings but from unified_rankings_hourly/daily tables
  }

  private async createSyncLog(serviceId: string, syncType: string): Promise<string> {
    const [log] = await query<{ id: string }>(`
      INSERT INTO unified_ranking_sync_logs (
        service_id, sync_type, started_at, status
      ) VALUES ($1, $2, NOW(), 'running')
      RETURNING id
    `, [serviceId, syncType]);

    return log.id;
  }

  private async updateSyncLog(
    logId: string, 
    status: string, 
    error: any = null
  ) {
    await query(`
      UPDATE unified_ranking_sync_logs
      SET 
        status = $2,
        completed_at = NOW(),
        error_details = $3
      WHERE id = $1
    `, [
      logId,
      status,
      error ? JSON.stringify({ message: error.message, stack: error.stack }) : null
    ]);
  }
}

// Export singleton instance
export const rankingSyncWorker = new RankingSyncWorker();

// Start worker if run directly
if (require.main === module) {
  rankingSyncWorker.start().catch(error => {
    console.error('Failed to start ranking sync worker:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await rankingSyncWorker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await rankingSyncWorker.stop();
    process.exit(0);
  });
}
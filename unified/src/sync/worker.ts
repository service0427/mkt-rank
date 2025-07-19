// Sync Worker
import cron from 'node-cron';
import { query, withTransaction } from '../db/postgres';
import { AdapterFactory } from '../services/adapter.factory';
import { UnifiedService, UnifiedKeyword } from '../types';

class SyncWorker {
  private syncTasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;

  async start() {
    console.log('Starting Sync Worker...');
    this.isRunning = true;

    try {
      // Load active services
      const services = await this.getActiveServices();
      
      // Schedule sync for each service
      for (const service of services) {
        await this.scheduleServiceSync(service);
      }

      // Schedule service reload every 5 minutes
      cron.schedule('*/5 * * * *', async () => {
        await this.reloadServices();
      });

      console.log(`Sync Worker started. Monitoring ${services.length} services.`);
    } catch (error) {
      console.error('Failed to start Sync Worker:', error);
      throw error;
    }
  }

  async stop() {
    console.log('Stopping Sync Worker...');
    this.isRunning = false;

    // Stop all scheduled tasks
    for (const [serviceId, task] of this.syncTasks) {
      task.stop();
      console.log(`Stopped sync for service: ${serviceId}`);
    }

    this.syncTasks.clear();
    console.log('Sync Worker stopped');
  }

  private async getActiveServices(): Promise<UnifiedService[]> {
    const services = await query<UnifiedService>(`
      SELECT * FROM unified_services 
      WHERE is_active = true
    `);
    return services;
  }

  private async scheduleServiceSync(service: UnifiedService) {
    const syncConfig = service.sync_config || { interval_minutes: 60 };
    const interval = syncConfig.interval_minutes || 60;

    // Create cron expression (every N minutes)
    const cronExpression = `*/${interval} * * * *`;

    // Remove existing task if any
    if (this.syncTasks.has(service.service_id)) {
      this.syncTasks.get(service.service_id)!.stop();
    }

    // Schedule new task
    const task = cron.schedule(cronExpression, async () => {
      await this.syncService(service);
    });

    this.syncTasks.set(service.service_id, task);
    console.log(`Scheduled sync for ${service.service_name} every ${interval} minutes`);

    // Run initial sync
    await this.syncService(service);
  }

  private async syncService(service: UnifiedService) {
    console.log(`Starting sync for service: ${service.service_name}`);
    const startTime = new Date();

    // Create sync log entry
    const syncLogId = await this.createSyncLog(service.service_id, startTime);

    try {
      // Create adapter
      const adapter = await AdapterFactory.createAdapterFromService(service);

      // Determine sync direction
      const direction = service.sync_config?.direction || 'bidirectional';

      let result;
      if (direction === 'import' || direction === 'bidirectional') {
        result = await this.importKeywords(service, adapter);
      }

      if (direction === 'export' || direction === 'bidirectional') {
        result = await this.exportKeywords(service, adapter);
      }

      // Update sync log with success
      await this.updateSyncLog(syncLogId, 'success', result);

      await adapter.disconnect();
      console.log(`Completed sync for service: ${service.service_name}`);

    } catch (error) {
      console.error(`Sync failed for service ${service.service_name}:`, error);
      
      // Update sync log with failure
      await this.updateSyncLog(syncLogId, 'failed', null, error);
    }
  }

  private async importKeywords(service: UnifiedService, adapter: any) {
    console.log(`Importing keywords from ${service.service_name}...`);

    // Fetch keywords from external service
    const externalKeywords = await adapter.fetchKeywords({ limit: 1000 });
    
    let successCount = 0;
    let failedCount = 0;

    // Import in batches
    const batchSize = 100;
    for (let i = 0; i < externalKeywords.length; i += batchSize) {
      const batch = externalKeywords.slice(i, i + batchSize);
      
      try {
        await withTransaction(async (client) => {
          for (const keyword of batch) {
            try {
              await client.query(`
                INSERT INTO unified_search_keywords (
                  keyword, service_id, is_active, 
                  pc_count, mobile_count, total_count,
                  pc_ratio, mobile_ratio, type, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (keyword, service_id, type) 
                DO UPDATE SET
                  is_active = EXCLUDED.is_active,
                  pc_count = EXCLUDED.pc_count,
                  mobile_count = EXCLUDED.mobile_count,
                  total_count = EXCLUDED.total_count,
                  pc_ratio = EXCLUDED.pc_ratio,
                  mobile_ratio = EXCLUDED.mobile_ratio,
                  metadata = EXCLUDED.metadata,
                  updated_at = CURRENT_TIMESTAMP
              `, [
                keyword.keyword,
                service.service_id,
                keyword.is_active ?? true,
                keyword.pc_count ?? 0,
                keyword.mobile_count ?? 0,
                keyword.total_count ?? 0,
                keyword.pc_ratio ?? 0,
                keyword.mobile_ratio ?? 0,
                keyword.type || 'shopping',
                JSON.stringify(keyword.metadata || {})
              ]);
              successCount++;
            } catch (error) {
              console.error(`Failed to import keyword: ${keyword.keyword}`, error);
              failedCount++;
            }
          }
        });
      } catch (error) {
        console.error('Batch import failed:', error);
        failedCount += batch.length;
      }
    }

    console.log(`Import completed: ${successCount} success, ${failedCount} failed`);
    
    return {
      total_records: externalKeywords.length,
      success_records: successCount,
      failed_records: failedCount
    };
  }

  private async exportKeywords(service: UnifiedService, adapter: any) {
    console.log(`Exporting keywords to ${service.service_name}...`);

    // Fetch keywords for this service
    const keywords = await query<UnifiedKeyword>(`
      SELECT * FROM unified_search_keywords
      WHERE service_id = $1 AND is_active = true
    `, [service.service_id]);

    // Export to external service
    const result = await adapter.syncKeywords(keywords);

    console.log(`Export completed: ${result.successRecords} success, ${result.failedRecords} failed`);
    
    return {
      total_records: keywords.length,
      success_records: result.successRecords,
      failed_records: result.failedRecords
    };
  }

  private async createSyncLog(serviceId: string, startTime: Date): Promise<string> {
    const [log] = await query<{ sync_id: string }>(`
      INSERT INTO unified_sync_logs (
        service_id, sync_type, sync_direction, started_at, status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING sync_id
    `, [serviceId, 'incremental', 'bidirectional', startTime, 'running']);

    return log.sync_id;
  }

  private async updateSyncLog(
    syncId: string, 
    status: string, 
    result: any | null, 
    error: any = null
  ) {
    await query(`
      UPDATE unified_sync_logs
      SET 
        status = $2,
        completed_at = CURRENT_TIMESTAMP,
        total_records = $3,
        success_records = $4,
        failed_records = $5,
        error_details = $6
      WHERE sync_id = $1
    `, [
      syncId,
      status,
      result?.total_records || 0,
      result?.success_records || 0,
      result?.failed_records || 0,
      error ? JSON.stringify({ message: error.message, stack: error.stack }) : null
    ]);
  }

  private async reloadServices() {
    if (!this.isRunning) return;

    console.log('Reloading services...');
    const services = await this.getActiveServices();

    // Remove tasks for inactive services
    for (const [serviceId, task] of this.syncTasks) {
      if (!services.find(s => s.service_id === serviceId)) {
        task.stop();
        this.syncTasks.delete(serviceId);
        console.log(`Removed sync for inactive service: ${serviceId}`);
      }
    }

    // Add tasks for new services
    for (const service of services) {
      if (!this.syncTasks.has(service.service_id)) {
        await this.scheduleServiceSync(service);
      }
    }
  }
}

// Export singleton instance
export const syncWorker = new SyncWorker();

// Start worker if run directly
if (require.main === module) {
  syncWorker.start().catch(error => {
    console.error('Failed to start sync worker:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await syncWorker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await syncWorker.stop();
    process.exit(0);
  });
}
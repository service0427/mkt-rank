// MySQL Service Adapter
import mysql from 'mysql2/promise';
import { BaseAdapter } from './base.adapter';
import { 
  UnifiedKeyword, 
  SyncResult, 
  FetchOptions, 
  MySQLAdapterConfig 
} from '../types';

export class MySQLAdapter extends BaseAdapter {
  private pool: mysql.Pool | null = null;
  private tableName: string = 'ad_slots'; // Default table for ad_slots

  constructor(config: MySQLAdapterConfig) {
    super(config);
    this.service.db_type = 'mysql';
  }

  async connect(): Promise<void> {
    try {
      const config = this.config.connection as MySQLAdapterConfig['connection'];
      this.pool = mysql.createPool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      this.isConnected = true;
      console.log(`Connected to MySQL: ${this.service.service_code}`);
    } catch (error) {
      this.isConnected = false;
      throw new Error(`Failed to connect to MySQL: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.isConnected = false;
    console.log(`Disconnected from MySQL: ${this.service.service_code}`);
  }

  async validateConnection(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch {
      return false;
    }
  }

  async fetchKeywords(options?: FetchOptions): Promise<UnifiedKeyword[]> {
    if (!this.pool) {
      throw new Error('Not connected to MySQL');
    }

    const startTime = Date.now();
    const limit = options?.limit || 1000;
    const offset = options?.offset || 0;

    try {
      let query = `
        SELECT DISTINCT work_keyword as keyword
        FROM ${this.tableName}
        WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
      `;
      
      const params: any[] = [];

      // Apply since filter for incremental sync
      if (options?.since) {
        query += ' AND updated_at >= ?';
        params.push(options.since);
      }

      // Add ordering and pagination
      query += ' ORDER BY work_keyword LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows] = await this.pool.execute(query, params);

      // Map MySQL data to unified format
      const keywords: UnifiedKeyword[] = (rows as any[]).map(record => ({
        id: '', // Will be generated by unified system
        keyword: record.keyword,
        service_id: this.service.service_id,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        type: 'ad_slots',
        metadata: {
          source: 'mysql_ad_slots'
        }
      }));

      console.log(`Fetched ${keywords.length} keywords from MySQL in ${Date.now() - startTime}ms`);
      return keywords;

    } catch (error) {
      console.error('Error fetching keywords from MySQL:', error);
      throw error;
    }
  }

  async syncKeywords(keywords: UnifiedKeyword[]): Promise<SyncResult> {
    if (!this.pool) {
      throw new Error('Not connected to MySQL');
    }

    const startTime = Date.now();
    const errors: Array<{record: any, error: string}> = [];

    // For MySQL ad_slots, we typically don't sync back keywords
    // This is mainly for reading keywords from ad_slots
    // If sync is needed, implement based on specific requirements

    console.log('MySQL ad_slots is read-only for keywords. Sync skipped.');
    
    return this.createSyncResult(
      true,
      keywords.length,
      keywords.length, // All "successful" as no-op
      errors,
      startTime
    );
  }

  // MySQL 특화 메서드 - ad_slots 관련
  async getAdSlotStats(): Promise<{
    total: number;
    active: number;
    byStatus: Record<string, number>;
  }> {
    if (!this.pool) {
      throw new Error('Not connected to MySQL');
    }

    try {
      // Total count
      const [totalRows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM ad_slots WHERE work_keyword IS NOT NULL'
      );
      const total = (totalRows as any)[0].count;

      // Active count
      const [activeRows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM ad_slots WHERE status = "ACTIVE" AND is_active = 1 AND work_keyword IS NOT NULL'
      );
      const active = (activeRows as any)[0].count;

      // Count by status
      const [statusRows] = await this.pool.execute(
        'SELECT status, COUNT(*) as count FROM ad_slots WHERE work_keyword IS NOT NULL GROUP BY status'
      );

      const byStatus: Record<string, number> = {};
      (statusRows as any[]).forEach(row => {
        byStatus[row.status] = row.count;
      });

      return { total, active, byStatus };
    } catch (error) {
      console.error('Error getting stats from MySQL:', error);
      throw error;
    }
  }

  // Get ad slots with their MID information
  async getAdSlotsWithMID(): Promise<Array<{
    keyword: string;
    price_compare_mid?: string;
    product_mid?: string;
    seller_mid?: string;
  }>> {
    if (!this.pool) {
      throw new Error('Not connected to MySQL');
    }

    try {
      const [rows] = await this.pool.execute(`
        SELECT 
          work_keyword as keyword,
          price_compare_mid,
          product_mid,
          seller_mid
        FROM ad_slots
        WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
      `);

      return rows as any[];
    } catch (error) {
      console.error('Error getting ad slots with MID:', error);
      throw error;
    }
  }
}
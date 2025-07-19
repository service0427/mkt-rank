// Supabase Service Adapter
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BaseAdapter } from './base.adapter';
import { 
  UnifiedKeyword, 
  SyncResult, 
  FetchOptions, 
  SupabaseAdapterConfig 
} from '../types';

export class SupabaseAdapter extends BaseAdapter {
  private client: SupabaseClient | null = null;
  private tableName: string = 'search_keywords';

  constructor(config: SupabaseAdapterConfig) {
    super(config);
    this.service.db_type = 'supabase';
    this.service.service_url = config.connection.url;
  }

  async connect(): Promise<void> {
    try {
      const { url, key } = this.config.connection as { url: string; key: string };
      this.client = createClient(url, key);
      this.isConnected = true;
      console.log(`Connected to Supabase: ${this.service.service_code}`);
    } catch (error) {
      this.isConnected = false;
      throw new Error(`Failed to connect to Supabase: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.isConnected = false;
    console.log(`Disconnected from Supabase: ${this.service.service_code}`);
  }

  async validateConnection(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Test query to validate connection
      const { error } = await this.client
        .from(this.tableName)
        .select('count')
        .limit(1);
      
      return !error;
    } catch {
      return false;
    }
  }

  async fetchKeywords(options?: FetchOptions): Promise<UnifiedKeyword[]> {
    if (!this.client) {
      throw new Error('Not connected to Supabase');
    }

    const startTime = Date.now();
    const limit = options?.limit || 1000;
    const offset = options?.offset || 0;

    try {
      let query = this.client
        .from(this.tableName)
        .select('*');

      // Apply filters
      if (options?.filter) {
        Object.entries(options.filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      // Apply since filter for incremental sync
      if (options?.since) {
        query = query.gte('updated_at', options.since.toISOString());
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Map external data to unified format
      const keywords: UnifiedKeyword[] = (data || []).map(record => ({
        ...this.mapFields(record, this.getFieldMappings()),
        service_id: this.service.service_id,
        metadata: {
          original_id: record.id,
          source: 'supabase'
        }
      }));

      console.log(`Fetched ${keywords.length} keywords from Supabase in ${Date.now() - startTime}ms`);
      return keywords;

    } catch (error) {
      console.error('Error fetching keywords from Supabase:', error);
      throw error;
    }
  }

  async syncKeywords(keywords: UnifiedKeyword[]): Promise<SyncResult> {
    if (!this.client) {
      throw new Error('Not connected to Supabase');
    }

    const startTime = Date.now();
    const errors: Array<{record: any, error: string}> = [];
    let successCount = 0;

    try {
      // Batch processing
      const batchSize = 100;
      for (let i = 0; i < keywords.length; i += batchSize) {
        const batch = keywords.slice(i, i + batchSize);
        
        // Map unified format to external format
        const mappedBatch = batch.map(keyword => {
          const mapped = this.mapFields(keyword, this.getFieldMappings(), true);
          // Preserve original ID if exists
          if (keyword.metadata?.original_id) {
            mapped.id = keyword.metadata.original_id;
          }
          return mapped;
        });

        // Upsert batch
        const { error } = await this.client
          .from(this.tableName)
          .upsert(mappedBatch, {
            onConflict: 'keyword,type', // Assuming unique constraint
            ignoreDuplicates: false
          });

        if (error) {
          batch.forEach(record => {
            errors.push({ record, error: error.message });
          });
        } else {
          successCount += batch.length;
        }
      }

      return this.createSyncResult(
        errors.length === 0,
        keywords.length,
        successCount,
        errors,
        startTime
      );

    } catch (error) {
      console.error('Error syncing keywords to Supabase:', error);
      return this.createSyncResult(
        false,
        keywords.length,
        successCount,
        errors,
        startTime
      );
    }
  }

  // Supabase 특화 메서드
  async getSearchKeywordStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
  }> {
    if (!this.client) {
      throw new Error('Not connected to Supabase');
    }

    try {
      // Total count
      const { count: total } = await this.client
        .from(this.tableName)
        .select('count', { count: 'exact' });

      // Active count
      const { count: active } = await this.client
        .from(this.tableName)
        .select('count', { count: 'exact' })
        .eq('is_active', true);

      // Count by type
      const { data: typeData } = await this.client
        .from(this.tableName)
        .select('type')
        .not('type', 'is', null);

      const byType: Record<string, number> = {};
      typeData?.forEach(record => {
        const type = record.type || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
      });

      return {
        total: total || 0,
        active: active || 0,
        byType
      };
    } catch (error) {
      console.error('Error getting stats from Supabase:', error);
      throw error;
    }
  }
}
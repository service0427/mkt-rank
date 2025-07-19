// Base Service Adapter
import { 
  ServiceAdapter, 
  UnifiedService, 
  UnifiedKeyword, 
  SyncResult, 
  FetchOptions, 
  FieldMappings,
  BaseAdapterConfig 
} from '../types';

export abstract class BaseAdapter implements ServiceAdapter {
  protected service: UnifiedService;
  protected isConnected: boolean = false;

  constructor(protected config: BaseAdapterConfig) {
    this.service = {
      service_id: config.service.service_id,
      service_code: config.service.service_code,
      service_url: '', // Set by child class
      service_name: config.service.service_name,
      db_type: 'postgresql', // Override in child class
      connection_config: config.connection,
      sync_config: {
        interval_minutes: 1,
        batch_size: 1000,
        direction: 'bidirectional'
      },
      field_mappings: config.service.field_mappings,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract validateConnection(): Promise<boolean>;
  abstract fetchKeywords(options?: FetchOptions): Promise<UnifiedKeyword[]>;
  abstract syncKeywords(keywords: UnifiedKeyword[]): Promise<SyncResult>;

  getFieldMappings(): FieldMappings {
    return this.service.field_mappings;
  }

  getServiceInfo(): UnifiedService {
    return this.service;
  }

  // 필드 매핑 유틸리티
  protected mapFields(source: any, mappings: FieldMappings, reverse: boolean = false): any {
    const result: any = {};

    if (reverse) {
      // Unified → External (Export)
      Object.entries(mappings).forEach(([targetField, sourceRule]) => {
        if (typeof sourceRule === 'string') {
          if (sourceRule.startsWith('_constant:')) {
            // Skip constants on reverse mapping
            return;
          }
          result[sourceRule] = source[targetField];
        } else if (sourceRule.source) {
          result[sourceRule.source] = source[targetField];
        }
      });
    } else {
      // External → Unified (Import)
      Object.entries(mappings).forEach(([targetField, sourceRule]) => {
        if (typeof sourceRule === 'string') {
          if (sourceRule.startsWith('_constant:')) {
            // Handle constant values
            const constantValue = sourceRule.replace('_constant:', '');
            result[targetField] = constantValue === 'true' ? true : 
                                 constantValue === 'false' ? false : 
                                 constantValue;
          } else {
            // Direct field mapping
            result[targetField] = source[sourceRule];
          }
        } else if (sourceRule.constant !== undefined) {
          result[targetField] = sourceRule.constant;
        } else if (sourceRule.source) {
          result[targetField] = source[sourceRule.source];
          // Apply transform if exists
          if (sourceRule.transform) {
            result[targetField] = this.applyTransform(result[targetField], sourceRule.transform);
          }
        }
      });
    }

    return result;
  }

  protected applyTransform(value: any, transform: string): any {
    // Basic transforms
    switch (transform) {
      case 'lowercase':
        return value?.toString().toLowerCase();
      case 'uppercase':
        return value?.toString().toUpperCase();
      case 'trim':
        return value?.toString().trim();
      case 'number':
        return Number(value) || 0;
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  // 동기화 결과 생성 헬퍼
  protected createSyncResult(
    success: boolean, 
    totalRecords: number, 
    successRecords: number, 
    errors: Array<{record: any, error: string}> = [],
    startTime: number
  ): SyncResult {
    return {
      success,
      totalRecords,
      successRecords,
      failedRecords: totalRecords - successRecords,
      errors: errors.map(e => ({
        record: e.record,
        error: e.error,
        timestamp: new Date()
      })),
      duration: Date.now() - startTime
    };
  }
}
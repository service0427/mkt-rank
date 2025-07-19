// Service Adapter Factory
import { ServiceAdapter, BaseAdapterConfig } from '../types';
import { SupabaseAdapter } from './supabase.adapter';
import { MySQLAdapter } from './mysql.adapter';
// import { PostgreSQLAdapter } from './postgresql.adapter'; // Future implementation

export class AdapterFactory {
  static async createAdapter(
    type: 'supabase' | 'mysql' | 'postgresql', 
    config: BaseAdapterConfig
  ): Promise<ServiceAdapter> {
    let adapter: ServiceAdapter;

    switch (type) {
      case 'supabase':
        adapter = new SupabaseAdapter(config as any);
        break;
      
      case 'mysql':
        adapter = new MySQLAdapter(config as any);
        break;
      
      case 'postgresql':
        throw new Error('PostgreSQL adapter not yet implemented');
        // adapter = new PostgreSQLAdapter(config as any);
        // break;
      
      default:
        throw new Error(`Unsupported adapter type: ${type}`);
    }

    // Auto-connect on creation
    await adapter.connect();
    
    // Validate connection
    const isValid = await adapter.validateConnection();
    if (!isValid) {
      await adapter.disconnect();
      throw new Error(`Failed to validate connection for ${type}`);
    }

    return adapter;
  }

  static async createAdapterFromService(service: {
    service_id: string;
    service_code: string;
    service_name: string;
    db_type: 'supabase' | 'mysql' | 'postgresql';
    connection_config: Record<string, any>;
    field_mappings: Record<string, any>;
  }): Promise<ServiceAdapter> {
    const config: BaseAdapterConfig = {
      service: {
        service_id: service.service_id,
        service_code: service.service_code,
        service_name: service.service_name,
        field_mappings: service.field_mappings
      },
      connection: service.connection_config
    };

    return this.createAdapter(service.db_type, config);
  }
}
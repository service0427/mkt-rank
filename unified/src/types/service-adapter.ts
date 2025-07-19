// Service Adapter specific types

export interface BaseAdapterConfig {
  service: {
    service_id: string;
    service_code: string;
    service_name: string;
    field_mappings: Record<string, any>;
  };
  connection: Record<string, any>;
}

export interface SupabaseAdapterConfig extends BaseAdapterConfig {
  connection: {
    url: string;
    key: string;
  };
}

export interface MySQLAdapterConfig extends BaseAdapterConfig {
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export interface PostgreSQLAdapterConfig extends BaseAdapterConfig {
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export interface AdapterFactory {
  createAdapter(type: 'supabase' | 'mysql' | 'postgresql', config: BaseAdapterConfig): Promise<ServiceAdapter>;
}

// Mapping utilities
export interface MappingContext {
  source: Record<string, any>;
  target: Record<string, any>;
  mappings: Record<string, any>;
}

export type TransformFunction = (value: any, context: MappingContext) => any;

export interface TransformRegistry {
  [key: string]: TransformFunction;
}

// Import from main types
import { ServiceAdapter } from './index';
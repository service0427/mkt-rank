// Services Controller
import { query, withTransaction } from '../db/postgres';
import { UnifiedService } from '../types';

export async function getServices() {
  try {
    const services = await query<UnifiedService>(`
      SELECT * FROM unified_services 
      ORDER BY created_at DESC
    `);
    return services;
  } catch (error) {
    console.error('Error fetching services:', error);
    // 테이블이 없는 경우 빈 배열 반환
    if ((error as any).code === '42P01') {
      return [];
    }
    throw error;
  }
}

export async function getServiceById(id: string) {
  try {
    const [service] = await query<UnifiedService>(`
      SELECT * FROM unified_services 
      WHERE service_id = $1
    `, [id]);
    return service;
  } catch (error) {
    console.error('Error fetching service by id:', error);
    return null;
  }
}

export async function createService(data: any) {
  const serviceId = `svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const [service] = await query<UnifiedService>(`
    INSERT INTO unified_services (
      service_id, service_code, service_name, service_url,
      db_type, connection_config, sync_config, field_mappings, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    serviceId,
    data.service_code,
    data.service_name,
    data.service_url,
    data.db_type,
    JSON.stringify(data.connection_config || {}),
    JSON.stringify(data.sync_config || { interval_minutes: 60, batch_size: 100, direction: 'bidirectional' }),
    JSON.stringify(data.field_mappings || {}),
    data.is_active ?? true
  ]);
  
  return service;
}

export async function updateService(id: string, data: any) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.service_code !== undefined) {
    updates.push(`service_code = $${paramCount++}`);
    values.push(data.service_code);
  }

  if (data.service_name !== undefined) {
    updates.push(`service_name = $${paramCount++}`);
    values.push(data.service_name);
  }
  
  if (data.service_url !== undefined) {
    updates.push(`service_url = $${paramCount++}`);
    values.push(data.service_url);
  }
  
  if (data.db_type !== undefined) {
    updates.push(`db_type = $${paramCount++}`);
    values.push(data.db_type);
  }
  
  if (data.connection_config !== undefined) {
    updates.push(`connection_config = $${paramCount++}`);
    values.push(JSON.stringify(data.connection_config));
  }
  
  if (data.sync_config !== undefined) {
    updates.push(`sync_config = $${paramCount++}`);
    values.push(JSON.stringify(data.sync_config));
  }
  
  if (data.field_mappings !== undefined) {
    updates.push(`field_mappings = $${paramCount++}`);
    values.push(JSON.stringify(data.field_mappings));
  }
  
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  
  values.push(id);
  
  const [service] = await query<UnifiedService>(`
    UPDATE unified_services 
    SET ${updates.join(', ')}
    WHERE service_id = $${paramCount}
    RETURNING *
  `, values);
  
  return service;
}

export async function deleteService(id: string) {
  await withTransaction(async (client) => {
    // 관련 키워드 삭제
    await client.query(`
      DELETE FROM unified_search_keywords 
      WHERE service_id = $1
    `, [id]);
    
    // 서비스 삭제
    await client.query(`
      DELETE FROM unified_services 
      WHERE service_id = $1
    `, [id]);
  });
  
  return true;
}
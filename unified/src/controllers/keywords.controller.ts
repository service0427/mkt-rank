// Keywords Controller
import { query } from '../db/postgres';
import { UnifiedKeyword } from '../types';

export async function getKeywords(filters: any = {}) {
  try {
    const { service_id, search, is_active, type } = filters;
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 50;
    
    let whereConditions = [];
    let params = [];
    let paramCount = 1;
    
    if (service_id) {
      whereConditions.push(`service_id = $${paramCount++}`);
      params.push(service_id);
    }
    
    if (search) {
      whereConditions.push(`keyword ILIKE $${paramCount++}`);
      params.push(`%${search}%`);
    }
    
    if (is_active !== undefined) {
      whereConditions.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }
    
    if (type) {
      whereConditions.push(`type = $${paramCount++}`);
      params.push(type);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    
    // Get total count
    const [countResult] = await query<{ count: string }>(`
      SELECT COUNT(*) as count 
      FROM unified_search_keywords k
      ${whereClause}
    `, params);
    
    const total = parseInt(countResult.count);
    
    // Get keywords with service info
    params.push(limit, offset);
    const keywords = await query<UnifiedKeyword & { service_name: string }>(`
      SELECT k.*, s.service_name 
      FROM unified_search_keywords k
      LEFT JOIN unified_services s ON k.service_id = s.service_id
      ${whereClause}
      ORDER BY k.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `, params);
    
    return {
      success: true,
      data: keywords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching keywords:', error);
    // 테이블이 없는 경우
    if ((error as any).code === '42P01') {
      return {
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0
        }
      };
    }
    throw error;
  }
}

export async function createKeyword(data: any) {
  const [keyword] = await query<UnifiedKeyword>(`
    INSERT INTO unified_search_keywords (
      keyword, service_id, is_active,
      pc_count, mobile_count, total_count,
      pc_ratio, mobile_ratio, type, user_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [
    data.keyword,
    data.service_id,
    data.is_active ?? true,
    data.pc_count ?? 0,
    data.mobile_count ?? 0,
    data.total_count ?? 0,
    data.pc_ratio ?? 0,
    data.mobile_ratio ?? 0,
    data.type || 'shopping',
    data.user_id || null,
    JSON.stringify(data.metadata || {})
  ]);
  
  return keyword;
}

export async function updateKeyword(id: string, data: any) {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.keyword !== undefined) {
    updates.push(`keyword = $${paramCount++}`);
    values.push(data.keyword);
  }
  
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }
  
  if (data.pc_count !== undefined) {
    updates.push(`pc_count = $${paramCount++}`);
    values.push(data.pc_count);
  }
  
  if (data.mobile_count !== undefined) {
    updates.push(`mobile_count = $${paramCount++}`);
    values.push(data.mobile_count);
  }
  
  if (data.total_count !== undefined) {
    updates.push(`total_count = $${paramCount++}`);
    values.push(data.total_count);
  }
  
  if (data.pc_ratio !== undefined) {
    updates.push(`pc_ratio = $${paramCount++}`);
    values.push(data.pc_ratio);
  }
  
  if (data.mobile_ratio !== undefined) {
    updates.push(`mobile_ratio = $${paramCount++}`);
    values.push(data.mobile_ratio);
  }
  
  if (data.type !== undefined) {
    updates.push(`type = $${paramCount++}`);
    values.push(data.type);
  }
  
  if (data.metadata !== undefined) {
    updates.push(`metadata = $${paramCount++}`);
    values.push(JSON.stringify(data.metadata));
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  
  values.push(id);
  
  const [keyword] = await query<UnifiedKeyword>(`
    UPDATE unified_search_keywords 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, values);
  
  return keyword;
}

export async function deleteKeyword(id: string) {
  await query(`
    DELETE FROM unified_search_keywords 
    WHERE id = $1
  `, [id]);
  
  return true;
}
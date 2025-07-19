// Initial services setup migration
import { query } from '../db/postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function createInitialServices() {
  console.log('Creating initial services...');
  
  try {
    // 1. mkt-guide.com (Supabase) 서비스 생성
    const mktGuideService = await query(`
      INSERT INTO unified_services (
        service_id, service_code, service_name, service_url,
        db_type, connection_config, sync_config, field_mappings, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      'svc_mkt_guide_' + Date.now(),
      'mkt-guide',
      'MKT Guide (Supabase)',
      'https://mkt-guide.com',
      'supabase',
      JSON.stringify({
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY
      }),
      JSON.stringify({
        interval_minutes: 60,
        batch_size: 100,
        direction: 'import'
      }),
      JSON.stringify({
        keyword: 'keyword',
        is_active: 'active',
        pc_count: 'pc_search_volume',
        mobile_count: 'mobile_search_volume',
        total_count: 'total_search_volume',
        type: { constant: 'shopping' }
      }),
      true
    ]);
    
    console.log('Created mkt-guide service:', mktGuideService[0].service_id);
    
    // 2. top.re.kr (MySQL) 서비스 생성
    const topReService = await query(`
      INSERT INTO unified_services (
        service_id, service_code, service_name, service_url,
        db_type, connection_config, sync_config, field_mappings, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      'svc_top_re_' + Date.now(),
      'top-re',
      'TOP.RE.KR (MySQL)',
      'https://top.re.kr',
      'mysql',
      JSON.stringify({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        database: process.env.MYSQL_DATABASE,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD
      }),
      JSON.stringify({
        interval_minutes: 60,
        batch_size: 100,
        direction: 'import'
      }),
      JSON.stringify({
        keyword: 'work_keyword',
        is_active: 'is_active',
        type: { constant: 'ad_slots' },
        metadata: {
          transform: 'JSON.stringify({ ad_slot_id: row.ad_slot_id, price_compare_mid: row.price_compare_mid, product_mid: row.product_mid, seller_mid: row.seller_mid })'
        }
      }),
      true
    ]);
    
    console.log('Created top.re.kr service:', topReService[0].service_id);
    
    return {
      mktGuideServiceId: mktGuideService[0].service_id,
      topReServiceId: topReService[0].service_id
    };
    
  } catch (error) {
    console.error('Failed to create initial services:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  createInitialServices()
    .then(() => {
      console.log('Initial services created successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { createInitialServices };
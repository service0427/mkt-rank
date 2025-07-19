// PostgreSQL Database Connection
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Create connection pool
export const pgPool = new Pool({
  host: process.env.LOCAL_PG_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_PG_PORT || '5432'),
  database: process.env.LOCAL_PG_DATABASE || 'mkt_rank_unified',
  user: process.env.LOCAL_PG_USER || 'postgres',
  password: process.env.LOCAL_PG_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pgPool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pgPool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper functions
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pgPool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function getClient() {
  const client = await pgPool.connect();
  const query = client.query.bind(client);
  const release = () => {
    client.release();
  };

  // Monkey patch the query method to automatically track timing
  (client as any).query = async (text: string, params?: any[]) => {
    const start = Date.now();
    const res = await query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  };

  return { client, release };
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const { client, release } = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    release();
  }
}

// Initialize database schema
export async function initializeDatabase() {
  try {
    // Check if tables exist
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'unified_services'
    `);

    if (tableCheck.length === 0) {
      console.log('Creating database schema...');
      // TODO: Run migration script
      console.log('Database schema needs to be created. Run migrations/001_initial_schema.sql');
    } else {
      console.log('Database schema already exists');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Cleanup function
export async function closeDatabaseConnection() {
  await pgPool.end();
  console.log('Database connection pool closed');
}
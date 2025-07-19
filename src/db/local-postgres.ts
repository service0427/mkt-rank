import { Pool } from 'pg';

// PostgreSQL connection pool
export const pgPool = new Pool({
  host: process.env.LOCAL_PG_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_PG_PORT || '5432'),
  database: process.env.LOCAL_PG_DATABASE || 'postgres',
  user: process.env.LOCAL_PG_USER || 'postgres',
  password: process.env.LOCAL_PG_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pgPool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});
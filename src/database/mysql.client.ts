import mysql from 'mysql2/promise';
import { adSlotsConfig } from '../config/ad-slots.config';
import { logger } from '../utils/logger';

let pool: mysql.Pool | null = null;

export async function getMySQLPool(): Promise<mysql.Pool> {
  if (!pool) {
    try {
      pool = mysql.createPool({
        host: adSlotsConfig.mysql.host,
        port: adSlotsConfig.mysql.port,
        user: adSlotsConfig.mysql.user,
        password: adSlotsConfig.mysql.password,
        database: adSlotsConfig.mysql.database,
        connectionLimit: adSlotsConfig.mysql.connectionLimit,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });

      // 연결 테스트
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      
      logger.info('MySQL connection pool created successfully', {
        host: adSlotsConfig.mysql.host,
        database: adSlotsConfig.mysql.database,
      });
    } catch (error) {
      logger.error('Failed to create MySQL connection pool:', error);
      throw error;
    }
  }
  return pool;
}

export async function closeMySQLPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL connection pool closed');
  }
}

// Helper function for executing queries
export async function executeQuery<T = any>(
  query: string,
  params?: any[]
): Promise<T[]> {
  const pool = await getMySQLPool();
  const [rows] = await pool.execute(query, params);
  return rows as T[];
}

// Helper function for executing updates
export async function executeUpdate(
  query: string,
  params?: any[]
): Promise<mysql.ResultSetHeader> {
  const pool = await getMySQLPool();
  const [result] = await pool.execute(query, params);
  return result as mysql.ResultSetHeader;
}

// Transaction helper
export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const pool = await getMySQLPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
import winston from 'winston';
import path from 'path';
import { config } from '../config';

const logDir = path.join(process.cwd(), 'logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';
    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

// Create the logger
export const logger = winston.createLogger({
  level: config.environment === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'mkt-rank' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  ],
});

// Add console transport for non-production environments
if (config.environment !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Create a stream object with a 'write' function for Morgan
export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
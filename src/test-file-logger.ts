import { FileLogger } from './utils/file-logger';

const testLogger = async () => {
  const logger = new FileLogger();
  
  console.log('Testing file logger...');
  console.log('Log file path:', logger.getLogFilePath());
  
  // Test various log events
  logger.logSchedulerStart();
  logger.logCollectionStart(5);
  
  // Simulate keyword processing
  const keywords = ['신발', '가방', '시계', '옷', '화장품'];
  for (const keyword of keywords) {
    const duration = Math.floor(Math.random() * 3000) + 1000;
    const success = Math.random() > 0.1;
    logger.logKeywordProcessed(keyword, success, duration);
  }
  
  logger.logCollectionEnd(4, 1, 15000);
  
  // Test error logging
  logger.logError(new Error('Test error'), 'Testing context');
  
  // Test skip logging
  logger.logSchedulerSkipped('Queue is full');
  
  // Read and display logs
  console.log('\nLast 10 log entries:');
  const logs = logger.getTodayLogs();
  logs.slice(-10).forEach(log => console.log(log));
  
  console.log(`\nTotal log entries today: ${logs.length}`);
};

testLogger().catch(console.error);
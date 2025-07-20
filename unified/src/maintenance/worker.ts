// 유지보수 워커
import './scheduler';

console.log('Maintenance worker started');

// PM2가 프로세스를 유지하도록
process.on('SIGTERM', () => {
  console.log('Shutting down maintenance worker...');
  process.exit(0);
});
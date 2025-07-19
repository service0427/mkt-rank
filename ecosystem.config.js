module.exports = {
  apps: [
    {
      // 기존 메인 워커
      name: 'mkt-rank-worker',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-worker-error.log',
      out_file: './logs/pm2-worker-out.log',
      log_file: './logs/pm2-worker-combined.log',
      time: true,
      max_memory_restart: '1G',
    },
    {
      // 기존 큐 워커
      name: 'mkt-rank-queue',
      script: './dist/index-queue.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-queue-error.log',
      out_file: './logs/pm2-queue-out.log',
      log_file: './logs/pm2-queue-combined.log',
      time: true,
      max_memory_restart: '1G',
    },
    {
      // API 서버
      name: 'mkt-rank-api',
      script: './dist/start-api.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3333,
        API_HTTPS_PORT: 3443,
      },
      error_file: './logs/pm2-api-error.log',
      out_file: './logs/pm2-api-out.log',
      log_file: './logs/pm2-api-combined.log',
      time: true,
      max_memory_restart: '1G',
    },
    {
      // 새로운 AD_SLOTS 워커
      name: 'mkt-rank-ad-slots',
      script: './dist/start-ad-slots-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        AD_SLOTS_ENABLED: 'false', // 기본값은 비활성화
      },
      error_file: './logs/pm2-ad-slots-error.log',
      out_file: './logs/pm2-ad-slots-out.log',
      log_file: './logs/pm2-ad-slots-combined.log',
      time: true,
      max_memory_restart: '1G',
      // AD_SLOTS_ENABLED가 false면 시작하지 않음
      min_uptime: '10s',
      max_restarts: 5,
    },
  ],
};
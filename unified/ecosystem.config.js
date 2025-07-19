module.exports = {
  apps: [
    {
      name: 'unified-web',
      script: './dist/index.js',
      args: 'web',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: 'logs/unified-web-error.log',
      out_file: 'logs/unified-web-out.log',
      log_file: 'logs/unified-web-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'unified-sync',
      script: './dist/index.js',
      args: 'sync',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/unified-sync-error.log',
      out_file: 'logs/unified-sync-out.log',
      log_file: 'logs/unified-sync-combined.log',
      time: true,
      merge_logs: true,
      cron_restart: '0 * * * *' // 매시간 재시작
    }
  ]
};
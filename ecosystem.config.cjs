/**
 * PM2 ecosystem configuration for OSTM.
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'ostm',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 2000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
        PORT: 10002,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        JWT_SECRET: 'change-me-use-a-long-random-secret',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 10002,
        LOG_LEVEL: 'debug',
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}

/**
 * PM2 ecosystem configuration for OSTM.
<<<<<<< HEAD
 * Usage: pm2 start ecosystem.config.cjs
=======
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs ostm
 *   pm2 restart ostm
 *   pm2 stop ostm
 *   pm2 delete ostm
 *
 * Note: PM2 is installed globally (npm install -g pm2), it is NOT a project
 * dependency. This file only configures how the existing Node.js process is
 * supervised — no runtime behavior change.
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
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
<<<<<<< HEAD
      kill_timeout: 10000,
      listen_timeout: 10000,
=======

      // Graceful shutdown: give the app time to close SSH tunnels & flush stats
      // before PM2 sends SIGKILL.
      kill_timeout: 10000,
      listen_timeout: 10000,
      shutdown_with_message: false,

      // Restart policy
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 2000,
      exp_backoff_restart_delay: 200,
<<<<<<< HEAD
=======

      // Environment variables (override via .env or pm2 set)
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
      env: {
        NODE_ENV: 'production',
        PORT: 10002,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
<<<<<<< HEAD
        JWT_SECRET: 'change-me-use-a-long-random-secret',
=======
        DATA_DIR: './config',
        KEYS_DIR: './keys',
        LOGS_DIR: './logs',
        // JWT_SECRET must be set before going to production:
        //   pm2 start ecosystem.config.js --env production
        JWT_SECRET: 'change-me-use-a-long-random-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 10002,
        LOG_LEVEL: 'debug',
      },
<<<<<<< HEAD
=======

      // Logs — Pino already writes to logs/app.log; PM2 captures stdout/stderr too.
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
<<<<<<< HEAD
=======

      // Source map / stack friendliness
      node_args: '--enable-source-maps',
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    },
  ],
}

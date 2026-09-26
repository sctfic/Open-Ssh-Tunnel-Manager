module.exports = {
  apps: [{ name: 'ostm', script: 'src/server.js', instances: 1, exec_mode: 'fork', autorestart: true,
    kill_timeout: 30000, max_memory_restart: '512M', env: { NODE_ENV: 'production', PORT: 4000, OSTM_NETWORK_MODE: 'linux' } }]
};

module.exports = {
  apps: [{
    name: 'ostm-test', cwd: '/opt/ostm', script: 'src/server.js',
    interpreter: '/opt/ostm-runtime/node-v24.21.0-linux-arm64/bin/node',
    instances: 1, exec_mode: 'fork', autorestart: true, kill_timeout: 30000,
    max_memory_restart: '192M', time: true,
    env: {
      NODE_ENV: 'production', PORT: 4000, OSTM_HOST: '127.0.0.1',
      OSTM_DATA_DIR: '/var/lib/ostm', OSTM_NETWORK_MODE: 'linux',
      OSTM_NETWORK_HELPER: '/opt/ostm/src/network/helper.js',
      OSTM_HELPER_NODE: '/opt/ostm-runtime/node-v24.21.0-linux-arm64/bin/node'
    }
  }]
};

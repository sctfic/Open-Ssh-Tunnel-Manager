module.exports = {
  apps: [
    {
      name: 'OSTM2',
      version: '2.0.01',
      script: 'app.js',
      watch: true,
      ignore_watch: [
        './node_modules',
        './configs',
        './public',
        './docs',
        './.git',
        './logs/*', // Ajout explicite pour ignorer tout le contenu du répertoire logs
        '*.log',    // Ignorer tous les fichiers .log à la racine
        '**/*.log'  // Ignorer tous les fichiers .log dans tous les sous-répertoires
      ],
      max_memory_restart: '100M',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
        watch: true,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        watch: false // Désactiver watch en production
      },
      log_file: '/var/log/pm2/OSTM2/combined.log',
      out_file: '/var/log/pm2/OSTM2/out.log',
      error_file: '/var/log/pm2/OSTM2/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
  ],
};
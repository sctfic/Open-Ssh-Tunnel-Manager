module.exports = { // Configuration de PM2
    apps: [
      {
        name: 'OSTM', //  Open Ssh Tunnels Manager
        script: 'src/server.js',          // Le fichier principal de ton application
        watch: true,                      // Active la surveillance des fichiers
        ignore_watch: ['node_modules', 'logs', 'src/configs', 'docs'],  // Liste des fichiers/répertoires à ignorer
        env: {
          NODE_ENV: 'development',        // Définir l'environnement pour le développement
        },
        env_production: {
          NODE_ENV: 'production',         // Environnement de production
        },
      },
    ],
  };

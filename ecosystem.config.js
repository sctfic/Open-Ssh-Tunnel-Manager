module.exports = {
    apps: [
      {
        name: 'Open Ssh Tunnels Manager', // ostm
        script: 'src/server.js',          // Le fichier principal de ton application
        watch: true,                      // Active la surveillance des fichiers
        ignore_watch: ['node_modules', 'logs'],  // Liste des fichiers/répertoires à ignorer
        env: {
          NODE_ENV: 'development',        // Définir l'environnement pour le développement
        },
        env_production: {
          NODE_ENV: 'production',         // Environnement de production
        },
      },
    ],
  };


const fs = require('fs');
const path = require('path');
const tunnelConfigPath = path.join(__dirname, '../configs/tunnels/'); // Dossier contenant les fichiers JSON

/**
 * Lit et parse un fichier de configuration JSON d'un tunnel
 * @param {string} configName - Nom du tunnel (correspondant au fichier JSON sans extension)
 * @returns {Object|null} - Retourne l'objet de configuration ou null en cas d'erreur
 */

function readTunnelsConfig(configName) {
    try {
        const configFilePath = path.join(tunnelConfigPath, `${configName}.json`);

        if (!fs.existsSync(configFilePath)) {
            console.error(`Erreur: fichier de configuration ${configName}.json non trouvé.`);
            return null;
        }

        const configContent = fs.readFileSync(configFilePath, 'utf8');
        return JSON.parse(configContent);
    } catch (error) {
        console.error(`Erreur lors de la lecture de la configuration du tunnel ${configName}:`, error.message);
        return null;
    }
}

module.exports = readTunnelsConfig;

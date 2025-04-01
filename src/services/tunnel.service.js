const { readTunnelsConfig, writeTunnelsConfig } = require('../utils/rwTunnelsConfig');
const { logTrace } = require('../utils/tools');

/**
 * Ajoute un port de transfert à un tunnel existant
 * @param {string} tunnelId - Identifiant du tunnel
 * @param {Object} portData - Données du port à ajouter
 * @returns {Object} - Résultat de l'opération
 */
exports.addPortForward = async (tunnelId, portData) => {
    try {
        // Valider les paramètres requis
        if (!tunnelId) {
            throw new Error("L'identifiant du tunnel est requis");
        }

        // Vérifier que le type de tunnel est valide
        const { type, name, listen_port, listen_host, endpoint_host, endpoint_port } = portData;
        
        if (!type || !name) {
            throw new Error("Le type et le nom sont requis");
        }
        
        if (!type.match(/^-[LRD]$/)) {
            throw new Error("Le type doit être -L, -R ou -D");
        }
        
        // Valider selon le type de tunnel
        if (type === '-L' && (!endpoint_host || !endpoint_port)) {
            throw new Error("Pour un tunnel de type -L, endpoint_host et endpoint_port sont requis");
        } else if (type === '-R' && (!listen_host || !endpoint_host || !endpoint_port)) {
            throw new Error("Pour un tunnel de type -R, listen_host, endpoint_host et endpoint_port sont requis");
        }

        // Valider que les ports sont des nombres
        const portNum = parseInt(listen_port);
        if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
            throw new Error("Le port doit être un nombre entre 1 et 65535");
        }
        if (endpoint_port) {
            const endpointPortNum = parseInt(endpoint_port);
            if (isNaN(endpointPortNum) || endpointPortNum <= 0 || endpointPortNum > 65535) {
                throw new Error("Le port de destination doit être un nombre entre 1 et 65535");
            }
        }

        // Lire la configuration actuelle
        const config = readTunnelsConfig(tunnelId);
        if (!config) {
            throw new Error(`Tunnel ${tunnelId} non trouvé`);
        }

        // Vérifier si le tunnel existe déjà
        if (!config.tunnels) {
            config.tunnels = {};
        }
        
        if (!config.tunnels[type]) {
            config.tunnels[type] = {};
        }
        
        if (config.tunnels[type][listen_port]) {
            throw new Error(`Le port ${listen_port} est déjà configuré pour ce type de tunnel`);
        }

        // Préparer l'objet à ajouter selon le type
        let portConfig = {
            name,
            listen_port: portNum
        };

        if (type === '-L') {
            portConfig.endpoint_host = endpoint_host;
            portConfig.endpoint_port = parseInt(endpoint_port);
        } else if (type === '-R') {
            portConfig.listen_host = listen_host;
            portConfig.endpoint_host = endpoint_host;
            portConfig.endpoint_port = parseInt(endpoint_port);
        }
        // Pour -D, on garde juste name et listen_port

        // Ajouter le port à la configuration
        config.tunnels[type][listen_port] = portConfig;

        // Sauvegarder la configuration
        const saved = writeTunnelsConfig(tunnelId, config);
        if (!saved) {
            throw new Error(`Erreur lors de l'enregistrement de la configuration pour ${tunnelId}`);
        }

        logTrace(`Port ${type} ${listen_port} ajouté au tunnel ${tunnelId}`);
        return { 
            success: true, 
            tunnelId, 
            config: config.tunnels[type][listen_port],
            message: `Port ${listen_port} ajouté avec succès` 
        };

    } catch (error) {
        logTrace(`Erreur lors de l'ajout du port: ${error.message}`);
        throw error;
    }
};

/**
 * Supprime un port de transfert d'un tunnel existant
 * @param {string} tunnelId - Identifiant du tunnel
 * @param {string} type - Type de tunnel (-L, -R, -D)
 * @param {string} port - Numéro du port à supprimer
 * @returns {Object} - Résultat de l'opération
 */
exports.removePortForward = async (tunnelId, type, port) => {
    try {
        // Valider les paramètres requis
        if (!tunnelId) {
            throw new Error("L'identifiant du tunnel est requis");
        }

        if (!type || !port) {
            throw new Error("Le type et le port sont requis");
        }

        if (!type.match(/^-[LRD]$/)) {
            throw new Error("Le type doit être -L, -R ou -D");
        }

        // Lire la configuration actuelle
        const config = readTunnelsConfig(tunnelId);
        if (!config) {
            throw new Error(`Tunnel ${tunnelId} non trouvé`);
        }

        // Vérifier si le tunnel existe
        if (!config.tunnels || !config.tunnels[type] || !config.tunnels[type][port]) {
            throw new Error(`Le port ${port} de type ${type} n'existe pas dans la configuration`);
        }

        // Stocker une copie du port avant la suppression pour le retourner
        const removedPort = { ...config.tunnels[type][port] };

        // Supprimer le port
        delete config.tunnels[type][port];

        // Si le type de tunnel ne contient plus de ports, supprimer la clé
        if (Object.keys(config.tunnels[type]).length === 0) {
            delete config.tunnels[type];
        }

        // Sauvegarder la configuration
        const saved = writeTunnelsConfig(tunnelId, config);
        if (!saved) {
            throw new Error(`Erreur lors de l'enregistrement de la configuration pour ${tunnelId}`);
        }

        logTrace(`Port ${type} ${port} supprimé du tunnel ${tunnelId}`);
        return { 
            success: true, 
            tunnelId, 
            type,
            port,
            removedConfig: removedPort,
            message: `Port ${port} supprimé avec succès` 
        };

    } catch (error) {
        logTrace(`Erreur lors de la suppression du port: ${error.message}`);
        throw error;
    }
};

/**
 * Vérifie la connexion SSH du tunnel
 * @param {string} tunnelId - Identifiant du tunnel
 * @returns {Object} - Résultat du test
 */
exports.checkTunnel = async (tunnelId) => {
    try {
        // Validation à implémenter
        // Cette fonction pourrait tester la connexion SSH sans établir de tunnel
        // en utilisant une commande ssh simple
        return { success: true, message: "Fonction non implémentée" };
    } catch (error) {
        throw error;
    }
};
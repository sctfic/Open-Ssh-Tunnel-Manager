const e = require('express');
const { readTunnelsConfig, writeTunnelsConfig } = require('../utils/rwTunnelsConfig');
const { logTrace } = require('../utils/tools');
const net = require('net');

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
        if (!config.channels) {
            config.channels = {};
        }
        
        if (!config.channels[type]) {
            config.channels[type] = {};
        }
        
        if (config.channels[type][listen_port]) {
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
        config.channels[type][listen_port] = portConfig;

        // Sauvegarder la configuration
        const saved = writeTunnelsConfig(tunnelId, config);
        if (!saved) {
            throw new Error(`Erreur lors de l'enregistrement de la configuration pour ${tunnelId}`);
        }

        logTrace(`Port ${type} ${listen_port} ajouté au tunnel ${tunnelId}`);
        return { 
            success: true, 
            tunnelId, 
            config: config.channels[type][listen_port],
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
        if (!config.channels || !config.channels[type] || !config.channels[type][port]) {
            throw new Error(`Le port ${port} de type ${type} n'existe pas dans la configuration`);
        }

        // Stocker une copie du port avant la suppression pour le retourner
        const removedPort = { ...config.channels[type][port] };

        // Supprimer le port
        delete config.channels[type][port];

        // Si le type de tunnel ne contient plus de ports, supprimer la clé
        if (Object.keys(config.channels[type]).length === 0) {
            delete config.channels[type];
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
 * Vérifie si un port est ouvert sur un hôte donné
 * @param {string} host - Hôte à vérifier
 * @param {number} port - Port à vérifier
 * @returns {Promise<number|null>} - Temps de réponse en ms ou null en cas d'échec
 */
const checkPort = (host, port) => {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(1000); // Timeout de 3 secondes
        socket
            .connect(port, host, () => {
                const duration = Date.now() - start;
                socket.destroy();
                resolve(duration);
            })
            .on('error', () => {
                socket.destroy();
                resolve(null);
            })
            .on('timeout', () => {
                socket.destroy();
                resolve(null);
            });
    });
};

/**
 * Vérifie la connexion SSH du tunnel et les ports configurés
 * @param {string} tunnelId - Identifiant du tunnel
 * @returns {Object} - Résultat du test
 */
exports.checkTunnel = async (tunnelId) => {
    try {
        // Lire la configuration actuelle
        const config = readTunnelsConfig(tunnelId);
        if (!config) {
            throw new Error(`Tunnel ${tunnelId} non trouvé`);
        }

        // Vérifier le ssh_port
        config.ssh_status = await checkPort(config.ssh_host || 'localhost', config.ssh_port || 22);
        config.success = true;
        if (config.ssh_status === null) {
            // config.success = false;
            throw new Error(`Le port SSH (${config.ssh_port || 22}) n'est pas accessible sur ${config.ssh_host || 'localhost'}`);
        // } else {
        //     config.success = true;
        }

        // Vérifier les listen_port et endpoint_port
        for (const [type, ports] of Object.entries(config.channels || {})) {
            for (const [listenPort, portConfig] of Object.entries(ports)) {
                // Vérifier listen_port
                const listenHost = portConfig.listen_host || 'localhost';
                portConfig.listen_status = await checkPort(listenHost, parseInt(listenPort));

                // Vérifier endpoint_port si applicable
                if (portConfig.endpoint_host && portConfig.endpoint_port) {
                    portConfig.endpoint_status = await checkPort(portConfig.endpoint_host, parseInt(portConfig.endpoint_port));
                // } else {
                //     portConfig.endpoint_status = null;
                }
                // si listen_port est null ou endpoint_port est null alors success sera false
                if (portConfig.listen_status === null || (portConfig.endpoint_host && portConfig.endpoint_status === null)) {
                    portConfig.success = false;
                } else {
                    portConfig.success = true;
                }
            }
        }

        return config;
    } catch (error) {
        logTrace(`Erreur lors de la vérification du tunnel: ${error.message}`);
        return {
            success: false,
            message: `Erreur: ${error.message}`
        };
    }
};
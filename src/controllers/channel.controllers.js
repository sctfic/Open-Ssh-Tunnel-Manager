const fs = require('fs');
const path = require('path');
const tunnelService = require('../services/tunnel.service'); // Import du service

const tunnelDir = path.join(__dirname, '../configs/tunnels/');
const pidDir = path.join(__dirname, '../configs/pid');

/**
 * Contrôleur pour vérifier la connexion SSH d'un tunnel
 * @param {Object} req - Requête HTTP
 * @param {Object} res - Réponse HTTP
 */
exports.checkTunnel = async (req, res) => {
    try {
        const result = await tunnelService.checkTunnel(req.params.id);
        res.json({ success: true, message: "Test SSH réussi.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Contrôleur pour ajouter un port à un tunnel
 * @param {Object} req - Requête HTTP
 * @param {Object} res - Réponse HTTP
 */
exports.addPortForward = async (req, res) => {
    try {
        // Validation des entrées de la requête
        const { type, port, name, endpoint_host, endpoint_port, listen_host } = req.body;
        
        if (!type || !port || !name) {
            return res.status(400).json({ 
                success: false, 
                message: "Veuillez fournir le type de tunnel, le port et le nom" 
            });
        }

        // Appel au service
        const result = await tunnelService.addPortForward(req.params.id, req.body);
        
        // Si un tunnel est actif, informer l'utilisateur qu'il doit le redémarrer
        const pidFile = path.join(pidDir, `${req.params.id}.pid`);
        let needRestart = false;
        
        if (fs.existsSync(pidFile)) {
            needRestart = true;
        }

        res.json({ 
            success: true, 
            message: `Port ajouté${needRestart ? '. Veuillez redémarrer le tunnel pour appliquer les changements' : '.'}`, 
            result,
            needRestart 
        });
    } catch (error) {
        res.status(error.message.includes("non trouvé") ? 404 : 500)
           .json({ success: false, message: error.message });
    }
};

/**
 * Contrôleur pour supprimer un port d'un tunnel
 * @param {Object} req - Requête HTTP
 * @param {Object} res - Réponse HTTP
 */
exports.removePortForward = async (req, res) => {
    try {
        // Validation des paramètres
        const { tunnelId, type, port } = req.params;
        
        if (!tunnelId || !type || !port) {
            return res.status(400).json({ 
                success: false, 
                message: "Veuillez fournir l'identifiant du tunnel, le type et le port" 
            });
        }

        // Appel au service
        const result = await tunnelService.removePortForward(tunnelId, type, port);
        
        // Si un tunnel est actif, redémarrage du tunnel
        const pidFile = path.join(pidDir, `${tunnelId}.pid`);
        if (fs.existsSync(pidFile)) {
            // on redemare le tunnel
            

        }

        res.json({ 
            success: true, 
            message: `Port supprimé${needRestart ? '. Veuillez redémarrer le tunnel pour appliquer les changements' : '.'}`, 
            result
        });
    } catch (error) {
        res.status(error.message.includes("non trouvé") ? 404 : 500)
           .json({ success: false, message: error.message });
    }
};
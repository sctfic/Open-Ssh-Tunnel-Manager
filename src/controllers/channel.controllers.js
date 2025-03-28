const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readTunnelsConfig } = require('../utils/rwTunnelsConfig'); // Fonction pour lire la config
const { buildCmd } = require('../utils/buildCmd'); // Fonction pour générer la commande
const { logTrace, sleep } = require('../utils/tools'); // Fonction pour tracer les logs
const { log } = require('util');

const tunnelDir = path.join(__dirname, '../configs/tunnels/');
const pidDir = path.join(__dirname, '../configs/pid');

exports.checkTunnel = async (req, res) => {
    try {
        const result = await tunnelService.checkTunnel(req.params.id);
        res.json({ success: true, message: "Test SSH réussi.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.addPortForward = async (req, res) => {
    try {
        const result = await tunnelService.addPortForward(req.params.id, req.body);
        res.json({ success: true, message: "Port ajouté.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.removePortForward = async (req, res) => {
    try {
        const result = await tunnelService.removePortForward(req.params.id, req.params.type, req.params.port);
        res.json({ success: true, message: "Port supprimé.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
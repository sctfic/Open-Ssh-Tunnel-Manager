const express = require('express');
const router = express.Router();
const tunnelController = require('../controllers/tunnel.controllers');

// Route pour démarrer tous les tunnels ou un seul tunnel
router.get('/start/:tunnelId?', tunnelController.startTunnel);

// Route pour arrêter tous les tunnels ou un seul tunnel
router.get('/stop/:tunnelId?', tunnelController.stopTunnel);

// Route pour redémarrer tous les tunnels ou un seul tunnel
router.get('/restart/:tunnelId?', tunnelController.restartTunnel);

// Route pour obtenir l'état de tous les tunnels ou un seul tunnel
router.get('/status/:tunnelId?', tunnelController.getStatus);

// Route pour tester les serveurs SSH
router.get('/check/:tunnelId?', tunnelController.checkTunnel);

// Route pour ajouter un nouveau tunnel
router.post('/pairing', tunnelController.pairing);

// Route pour supprimer un tunnel
router.delete('/unpairing', tunnelController.unpairing);

// Route pour ajouter un port forward à un tunnel
router.post('/addPortForward', tunnelController.addPortForward);

// Route pour supprimer un port forward d'un tunnel
router.delete('/removePortForward', tunnelController.removePortForward);

module.exports = router;

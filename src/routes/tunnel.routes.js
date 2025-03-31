const express = require('express');
const router = express.Router();
const tunnelController = require('../controllers/tunnel.controllers');
const pairingController = require('../controllers/pairing.controllers');
const channelController = require('../controllers/channel.controllers');

// Route pour démarrer tous les tunnels ou un seul tunnel
router.get('/start/:tunnelId?', tunnelController.startTunnel);

// Route pour arrêter tous les tunnels ou un seul tunnel
router.get('/stop/:tunnelId?', tunnelController.stopTunnel);

// Route pour redémarrer tous les tunnels ou un seul tunnel
router.get('/restart/:tunnelId?', tunnelController.restartTunnel);

// Route pour obtenir l'état de tous les tunnels ou un seul tunnel
router.get('/status/:tunnelId?', tunnelController.getStatus);

// Route pour ajouter un nouveau tunnel
router.post('/pairing', pairingController.pairing);

// Route pour supprimer un tunnel
router.delete('/unpairing/:tunnelId', pairingController.unpairing);

// Route pour tester les serveurs SSH
router.get('/check/:tunnelId?', channelController.checkTunnel);

// route pour definir la bande passante d'un tunnel
router.post('/setBandwidth/:tunnelId', tunnelController.setBandwidth);

// Route pour ajouter un port forward à un tunnel
router.post('/addPortForward/:tunnelId', channelController.addPortForward);

// Route pour supprimer un port forward d'un tunnel
router.get('/removePortForward/:tunnelId/:type/:port', channelController.removePortForward);

module.exports = router;

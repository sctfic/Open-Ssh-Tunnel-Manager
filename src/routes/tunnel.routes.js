const { Router } = require('express');
const tunnelControllers = require('../controllers/tunnel.controllers');

const router = Router();

// Routes de gestion des tunnels
router.get('/start/:tunnelId?', tunnelControllers.startTunnel);
router.get('/stop/:tunnelId?', tunnelControllers.stopTunnel);
router.get('/restart/:tunnelId?', tunnelControllers.restartTunnel);
router.get('/status/:tunnelId?', tunnelControllers.getStatus);
router.post('/bandwidth/:tunnelId', tunnelControllers.setBandwidth);

module.exports = router;
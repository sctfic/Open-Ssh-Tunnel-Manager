const { Router } = require('express');
const channelControllers = require('../controllers/channel.controllers');

const router = Router();

// Routes de gestion des ports
router.post('/add/:tunnelId', channelControllers.addPortForward);
router.delete('/rm/:tunnelId/:type/:port', channelControllers.removePortForward);
router.get('/check/:id', channelControllers.checkTunnel);

module.exports = router;
const { Router } = require('express');
const pairingControllers = require('../controllers/pairing.controllers');

const router = Router();

// Routes de pairing
router.post('/plug', pairingControllers.pairing);
router.delete('/unplug/:tunnelId', pairingControllers.unpairing);

module.exports = router;
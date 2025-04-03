const express = require("express");
const channelRoutes = require("./channel.routes");
const tunnelRoutes = require("./tunnel.routes");
const pairingRoutes = require("./pairing.routes");

const router = express.Router();

router.use("/channel", channelRoutes);
router.use("/tunnels", tunnelRoutes);
router.use("/pairing", pairingRoutes);
// console.log(router);

module.exports = router;

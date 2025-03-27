const express = require("express");
const tunnelRoutes = require("./tunnel.routes");

const router = express.Router();

router.use("/tunnels", tunnelRoutes);

module.exports = router;

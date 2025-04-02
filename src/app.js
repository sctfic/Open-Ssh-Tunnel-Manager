require("dotenv").config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { pairing, unpairing } = require('./controllers/pairing.controllers');
const { 
  startTunnel, 
  stopTunnel, 
  restartTunnel, 
  getStatus,
  setBandwidth
} = require('./controllers/tunnel.controllers');
const { 
  checkTunnel,
  addPortForward,
  removePortForward
} = require('./controllers/channel.controllers');

// Middlewares
app.use(bodyParser.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes d'API
app.post('/api/tunnels/pairing', pairing);
app.post('/api/tunnels/unpairing', unpairing);

app.post('/api/tunnels/startTunnel/:tunnelId?', startTunnel);
app.post('/api/tunnels/stopTunnel/:tunnelId?', stopTunnel);
app.post('/api/tunnels/restartTunnel/:tunnelId?', restartTunnel);
app.get('/api/tunnels/status/:tunnelId?', getStatus);
app.post('/api/tunnels/setBandwidth/:tunnelId', setBandwidth);

app.get('/api/tunnels/checkTunnel/:id', checkTunnel);
app.post('/api/tunnels/addPortForward/:tunnelId', addPortForward);
app.delete('/api/tunnels/removePortForward/:tunnelId/:type/:port', removePortForward);

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Erreur interne du serveur' 
  });
});

// Configuration du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur OSTM en écoute sur le port ${PORT}`);
  console.log(`Endpoints disponibles :`);
  console.log(`- POST /api/tunnels/pairing`);
  console.log(`- POST /api/tunnels/startTunnel[/:tunnelId]`);
  console.log(`- POST /api/tunnels/addPortForward/:tunnelId`);
  console.log(`- GET /api/tunnels/status[/:tunnelId]`);
  // ... autres endpoints
});

module.exports = app;
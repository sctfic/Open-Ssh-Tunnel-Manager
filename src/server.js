require('dotenv').config();
const app = require('./app');
const { ENVIRONMENT } = require('./constants');

const PORT = process.env.PORT || 3000;

// Démarrage du serveur
const server = app.listen(PORT, () => {
    console.log(`🌐 http://localhost:${PORT} > mode ${ENVIRONMENT}`);

    // console.log('Routes disponibles:');
    // const listEndpoints = require('express-list-endpoints');
    // console.log(listEndpoints(app));
});

module.exports = server;
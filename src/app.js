require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path'); // Ajouté
const logger = require('./middlewares/logger');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');

const app = express();

// Middlewares de base
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger.requestLogger);

// Middleware statique (ajoutez cette ligne)
// app.use(express.static(path.join(__dirname, '../public')));
const publicPath = path.join(__dirname, '../public');
console.log(`Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Routes API
app.use('/api/v1', routes);

// Middlewares d'erreurs
app.use(errorHandler.notFound);
app.use(errorHandler.globalError);

module.exports = app;
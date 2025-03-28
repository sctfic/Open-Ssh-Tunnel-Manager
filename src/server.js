require("dotenv").config();
const path = require('path');
const express = require("express");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Pour parser le JSON dans les requêtes

app.use((req, res, next) => {
    // on copies req.body pour ne pas le modifier
    let body = { ...req.body };
    // on cache les valeur password
    if (body && body.adminPass) {
        body.adminPass = "*****";
    }
    console.log(req.method, req.url, body);
    next();
});

// Routes
app.use("/api", routes);

// Servir les fichiers statiques du dossier "public"
// app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static('/home/alban/www/ostm/public'));

// Gestion des erreurs 404 (placée après toutes les autres routes)
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: "Route non trouvée" , url:req.url});
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: "Erreur interne du serveur" });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
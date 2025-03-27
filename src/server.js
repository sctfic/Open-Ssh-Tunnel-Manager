require("dotenv").config();
const express = require("express");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Pour parser le JSON dans les requêtes

// Routes
app.use("/api", routes);

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route non trouvée" });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
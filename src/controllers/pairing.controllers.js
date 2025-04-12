const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { writeTunnelsConfig } = require('../utils/rwTunnelsConfig'); // Fonction pour lire la config
const { logTrace, sleep } = require('../utils/tools'); // Fonction pour tracer les logs
const { log } = require('util');

const tunnelDir = path.join(__dirname, '../configs/tunnels/');
const keyDir = path.join(__dirname, '../configs/key'); // '/root/.ssh'


if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
}

// Fonction pour vérifier si une chaîne est une clé publique SSH
function isPublicKey(str) {
    return str.startsWith('ssh-') && str.includes(' ');
}

// Fonction de pairing avec le serveur SSH
function pairingServer(ip, ostm_user, ostm_userPass, configName = 'test') {
    try {
        const keyPath = path.join(keyDir, `${configName}_key`);
        let pubKey;

        // Étape 1 : Vérifier si ostm_userPass est une clé publique ou un mot de passe
        if (isPublicKey(ostm_userPass)) {
            pubKey = ostm_userPass.trim();
            fs.writeFileSync(`${keyPath}.pub`, pubKey, 'utf-8');
            console.log(`Clé publique fournie enregistrée dans ${keyPath}.pub`);
        } else {
            // Étape 2 : Générer une paire de clés si elle n’existe pas
            if (!fs.existsSync(keyPath)) {
                console.log(`Génération de la paire de clés SSH pour ${configName}...`);
                execSync(`ssh-keygen -t ed25519 -f '${keyPath}' -N ""`, { stdio: 'inherit' });
                fs.chmodSync(keyPath, 0o600); // Sécuriser la clé privée
                console.log(`Paire de clés SSH générée dans ${keyPath}`);
            }
            pubKey = fs.readFileSync(`${keyPath}.pub`, 'utf-8').trim();

            // Étape 3 : Déposer la clé publique sur le serveur distant
            console.log(`Connexion à ${ip} pour configurer ${ostm_user}...`);
            const sshCmd = `sshpass -p '${ostm_userPass}' ssh ${ostm_user}@${ip} "mkdir -p ~/.ssh && echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`;
            execSync(sshCmd, { stdio: 'inherit' });
            console.log(`Clé publique déposée pour ${ostm_user}@${ip}`);
        }

        // Étape 4 : Tester la connexion SSH avec la clé
        console.log(`Test de la connexion SSH avec ${ostm_user}@${ip}...`);
        const testCmd = `ssh -i '${keyPath}' -o BatchMode=yes ${ostm_user}@${ip} "echo Yes!"`;
        const output = execSync(testCmd, { stdio: 'pipe' }).toString().trim();

        // Étape 5 : Valider la réponse et générer la configuration
        if (output === 'Yes!') {
            console.log(`Connexion SSH réussie avec la clé pour ${ostm_user}@${ip}`);

            const configPath = path.join(__dirname, '../configs/tunnels', `${configName}.json`);
            const config = {
                user: ostm_user,
                ip: ip,
                ssh_port: 22,
                ssh_key: keyPath,
                options: {
                    compression: 'yes',
                    ServerAliveInterval: 10,
                    ServerAliveCountMax: 3
                },
                bandwidth: { up: 200, down: 200 },
                channels: {
                    '-L': {},
                    '-R': {},
                    '-D': {}
                }
            };

            writeTunnelsConfig(configName, config);

            return { success: true, message: 'Pairing réussi', configPath };
        } else {
            throw new Error(`\nÉchec de la validation de la connexion SSH`);
        }
    } catch (error) {
        console.error(`Erreur lors du pairing avec ${ip}:`, error.message);
        return { success: false, message: `Erreur: ${error.message}` };
    }
}
exports.pairing = async (req, res) => {
    const { ip, adminUser, adminPass, configName } = req.body;
    logTrace(`Pairing avec ${ip} en cours...`);
    try {
        const result = pairingServer(ip, adminUser, adminPass, configName);
        if (result.success) {
            res.json({ success: true, message: "Tunnel ajouté.", result });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Fonction pour annuler le pairing avec un serveur SSH
function unpairing(configName, adminUser, adminPassword) {
    try {
        // Étape 1 : Vérifier et lire le fichier de configuration
        const configPath = path.join(__dirname, '../configs/tunnels', `${configName}.json`);
        if (!fs.existsSync(configPath)) {
            return { success: false, message: `Configuration ${configName} non trouvée.` };
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const ip = config.ip;

        // Étape 2 : Supprimer l'utilisateur distant via SSH
        const deleteUserCmd = `userdel -r tunnel_user`;
        const sshCmd = `sshpass -p '${adminPassword}' ssh ${adminUser}@${ip} "${deleteUserCmd}"`;
        execSync(sshCmd, { stdio: 'inherit' });

        // Étape 3 : Supprimer les clés SSH locales
        const keyPath = config.ssh_key; // Chemin de la clé privée dans la config
        if (fs.existsSync(keyPath)) {
            fs.unlinkSync(keyPath); // Supprimer la clé privée
        }
        if (fs.existsSync(`${keyPath}.pub`)) {
            fs.unlinkSync(`${keyPath}.pub`); // Supprimer la clé publique
        }

        // Étape 4 : Supprimer le fichier de configuration
        fs.unlinkSync(configPath);

        console.log(`Unpairing de ${configName} réussi. Utilisateur et fichiers supprimés.`);
        return { success: true, message: 'Unpairing réussi' };
    } catch (error) {
        console.error(`Erreur lors de l'unpairing de ${configName}:`, error.message);
        return { success: false, message: `Erreur: ${error.message}` };
    }
}

exports.unpairing = async (req, res) => {
    const { configName, adminUser, adminPass } = req.body;
    try {
        const result = unpairing(configName, adminUser, adminPass);
        if (result.success) {
            res.json({ success: true, message: "Tunnel supprimé.", result });
        } else {
            res.status(404).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
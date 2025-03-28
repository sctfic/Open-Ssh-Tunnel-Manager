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

// Fonction de pairing avec le serveur SSH
function pairingServer(ip, adminUser, adminPassword, configName = 'test') {
    try {
        // Étape 1 : Générer une nouvelle paire de clés SSH
        const keyPath = path.join(keyDir, `${configName}_key`);
        // si le fichier keyPath n'existe pas
        if (!fs.existsSync(keyPath)) {
            console.log(`Génération de la paire de clés SSH pour ${configName}...`, `ssh-keygen -t ed25519 -f ${keyPath} -N ""`);
            execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N ""`, { stdio: 'inherit' });
            fs.chmodSync(keyPath, 0o600); // Sécuriser les permissions de la clé privée
            console.log(`Paire de clés SSH générée dans ${keyPath}.`);
        }
        if (adminPassword.lenght > 127) {
            
        }

        // Étape 2 : Créer l'utilisateur distant et configurer son répertoire SSH
        const createUserCmd = `
            sudo useradd -m -s /bin/false ostm_user && 
            mkdir -p ~ostm_user/.ssh && 
            chown ostm_user:ostm_user ~ostm_user/.ssh && 
            chmod 700 ~ostm_user/.ssh && 
            touch ~ostm_user/.ssh/authorized_keys && 
            chown ostm_user:ostm_user ~ostm_user/.ssh/authorized_keys && 
            chmod 600 ~ostm_user/.ssh/authorized_keys
        `;
            console.log(`Création de l'utilisateur distant ostm_user sur ${ip}...`);
        const sshCmd = `sshpass -p '${adminPassword}' ssh ${adminUser}@${ip} "${createUserCmd}"`;
        execSync(sshCmd, { stdio: 'inherit' });
            console.log(`script distant user execité sur ${ip}.`);

        // Étape 3 : Déposer la clé publique sur le serveur
        const pubKey = fs.readFileSync(`${keyPath}.pub`, 'utf-8').trim();
        const appendKeyCmd = `echo '${pubKey}' >> ~ostm_user/.ssh/authorized_keys`;
        const appendSshCmd = `sshpass -p '${adminPassword}' ssh ${adminUser}@${ip} "${appendKeyCmd}"`;
        execSync(appendSshCmd, { stdio: 'inherit' });
            console.log(`Clé publique ajoutée à ~ostm_user/.ssh/authorized_keys sur ${ip}.`);

        // Étape 4 : Générer le fichier de configuration JSON
        const config = {
            user: 'ostm_user',
            ip: ip,
            ssh_port: 22,
            ssh_key: keyPath,
            "options": {
                "compression": "yes",
                "ServerAliveInterval": 10,
                "ServerAliveCountMax": 3
            },
            bandwidth: { up: 200, down: 200 },
            tunnels: {
                '-L': {},
                '-R': {},
                '-D': {}
            }
        };

        writeTunnelsConfig(configName, config);

        return { success: true, message: 'Pairing réussi', configPath };
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
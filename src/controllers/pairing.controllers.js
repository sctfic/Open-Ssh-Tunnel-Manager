const fs = require('fs');
const path = require('path');
const { writeTunnelsConfig, readTunnelsConfig } = require('../utils/rwTunnelsConfig'); // Fonction pour lire la config
const { logTrace, sleep } = require('../utils/tools'); // Fonction pour tracer les logs
const { execSync, exec } = require('child_process'); // Importer exec pour plus tard si besoin
const util = require('util'); // Pour promisify si on passe à exec
const execPromise = util.promisify(exec); // Pour exec asynchrone

const tunnelDir = path.join(__dirname, '../configs/tunnels/');
const keyDir = path.join(__dirname, '../configs/key'); // '/root/.ssh'

if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
}

// Fonction pour vérifier si une chaîne est une clé publique SSH
function isPublicKey(str) {
    return str.startsWith('ssh-') && str.includes(' ');
}


// Assurer l'existence du répertoire des clés
if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
    logTrace(`Répertoire des clés créé: ${keyDir}`);
}

// Fonction pour valider le nom de configuration (sécurité basique)
function isValidConfigName(name) {
    return /^[a-zA-Z0-9-_]+$/.test(name);
}

// Fonction de pairing améliorée (uniquement via mot de passe pour l'instant)
function pairingServer(ip, ostm_user, ostm_userPass, configName = 'default') {
    logTrace(`Début du pairing pour config: ${configName}, user: ${ostm_user}, ip: ${ip}`);

    // Validation du nom de configuration côté serveur
    if (!isValidConfigName(configName)) {
        return { success: false, message: `Erreur: Nom de configuration invalide (${configName}). Utilisez uniquement lettres, chiffres, tiret, underscore.` };
    }

    const keyPath = path.join(keyDir, `${configName}_key`);
    const pubKeyPath = `${keyPath}.pub`;
    const sshOptions = `-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10`; // Options SSH standard

    try {
        // === Étape 1 : Générer une paire de clés si elle n’existe pas ===
        if (!fs.existsSync(keyPath)) {
            logTrace(`Génération de la paire de clés SSH pour ${configName}...`);
            // Utilisation de -t ed25519 pour une meilleure sécurité/performance
            // Rediriger stderr vers stdout pour capturer les erreurs de ssh-keygen
            execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "ostm-${configName}"`, { stdio: 'pipe' });
            fs.chmodSync(keyPath, 0o600); // Sécuriser la clé privée
            logTrace(`Paire de clés SSH générée: ${keyPath}`);
        } else {
            logTrace(`Utilisation de la paire de clés existante pour ${configName}: ${keyPath}`);
        }

        // Lire la clé publique (qui existe forcément maintenant)
        if (!fs.existsSync(pubKeyPath)) {
             throw new Error(`La clé publique ${pubKeyPath} n'a pas pu être trouvée ou générée.`);
        }
        const pubKeyContent = fs.readFileSync(pubKeyPath, 'utf-8').trim();

        // === Étape 2 : Déposer la clé publique sur le serveur distant via mot de passe ===
        logTrace(`Dépôt de la clé publique sur ${ostm_user}@${ip}...`);

        // Commande distante plus robuste pour ajouter la clé
        const remoteCmdEnsureDir = `mkdir -p ~/.ssh && chmod 700 ~/.ssh`;
        const remoteCmdAddKey = `echo "${pubKeyContent}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
        // Vérifier si la clé est déjà présente pour éviter les doublons (optionnel mais propre)
        const remoteCmdCheckAndAdd = `
            if grep -qF "${pubKeyContent}" ~/.ssh/authorized_keys; then
                echo 'Clé déjà présente sur le serveur distant.';
            else
                echo 'Ajout de la clé au serveur distant...' && ${remoteCmdAddKey};
            fi
        `;

        // Construire la commande sshpass complète
        // Attention: Échapper correctement le mot de passe s'il contient des caractères spéciaux pour le shell
        const escapedPass = ostm_userPass.replace(/'/g, "'\\''"); // Échappe les apostrophes pour 'sshpass -p'
        const sshpassCmdEnsureDir = `sshpass -p '${escapedPass}' ssh ${sshOptions} ${ostm_user}@${ip} "${remoteCmdEnsureDir}"`;
        const sshpassCmdCheckAndAdd = `sshpass -p '${escapedPass}' ssh ${sshOptions} ${ostm_user}@${ip} "${remoteCmdCheckAndAdd}"`;

        try {
             logTrace("Exécution: sshpass pour assurer ~/.ssh");
             execSync(sshpassCmdEnsureDir, { stdio: 'pipe', timeout: 15000 }); // Timeout de 15s
             logTrace("Exécution: sshpass pour ajouter la clé");
             execSync(sshpassCmdCheckAndAdd, { stdio: 'pipe', timeout: 15000 }); // Timeout de 15s
             logTrace(`Clé publique déposée ou déjà présente pour ${ostm_user}@${ip}`);
        } catch (sshpassError) {
             logTrace(`Erreur sshpass: ${sshpassError}`);
             // Essayer de donner une erreur plus utile
             let errorMsg = sshpassError.message;
             if (errorMsg.includes('Permission denied') || errorMsg.includes('Authentication failed')) {
                 errorMsg = `Échec de l'authentification avec le mot de passe fourni pour ${ostm_user}@${ip}.`;
             } else if (errorMsg.includes('Connection timed out')) {
                 errorMsg = `Timeout lors de la connexion SSH à ${ip}. Vérifiez l'IP et le port.`;
             } else if (errorMsg.includes('Host key verification failed')) {
                errorMsg = `Échec de la vérification de la clé d'hôte pour ${ip}.`;
             } else {
                 errorMsg = `Erreur SSH lors du dépôt de la clé: ${errorMsg}`;
             }
             throw new Error(errorMsg);
        }

        // === Étape 3 : Tester la connexion SSH avec la clé générée ===
        logTrace(`Test de la connexion SSH avec la clé pour ${ostm_user}@${ip}...`);
        const testCmd = `ssh -i "${keyPath}" ${sshOptions} ${ostm_user}@${ip} "echo OSTM_PAIRING_SUCCESS"`;
        let testOutput;
        try {
             testOutput = execSync(testCmd, { stdio: 'pipe', timeout: 15000 }).toString().trim(); // Timeout 15s
        } catch (sshTestError) {
             logTrace(`Erreur test SSH avec clé: ${sshTestError}`);
             throw new Error(`Échec du test de connexion SSH avec la nouvelle clé pour ${ostm_user}@${ip}. ${sshTestError.message}`);
        }


        // === Étape 4 : Valider la réponse et générer la configuration ===
        if (testOutput === 'OSTM_PAIRING_SUCCESS') {
            logTrace(`Connexion SSH avec clé réussie pour ${ostm_user}@${ip}`);

            const config = {
                user: ostm_user,
                ip: ip,
                ssh_port: 22, // Peut être rendu configurable plus tard
                ssh_key: keyPath, // Chemin absolu vers la clé privée
                options: {
                    Compression: 'yes', // Note: 'C' majuscule pour OpenSSH
                    ServerAliveInterval: 15, // Augmenté légèrement
                    ServerAliveCountMax: 3,
                    // ExitOnForwardFailure: 'yes' // Option utile ?
                },
                bandwidth: { up: 1000, down: 5000 }, // Valeurs par défaut (Ko/s) ? Ajustez selon besoin.
                channels: {
                    '-L': {},
                    '-R': {},
                    '-D': {}
                }
            };

            // Écrire la configuration
            writeTunnelsConfig(configName, config); // Utilise la fonction importée
             logTrace(`Configuration ${configName}.json créée avec succès.`);

            return { success: true, message: `Pairing réussi pour ${configName}`, configPath: path.join(tunnelDir, `${configName}.json`) };
        } else {
            // Le test a réussi mais n'a pas renvoyé le bon message (ne devrait pas arriver avec echo)
             throw new Error(`Réponse inattendue lors du test de connexion SSH : "${testOutput}"`);
        }
    } catch (error) {
        console.error(`Erreur lors du pairing pour ${configName} (${ostm_user}@${ip}):`, error.message);
        // Nettoyage partiel ? Si la clé a été générée mais que le dépôt échoue, on pourrait supprimer la clé générée.
        // Pour l'instant, on laisse les artefacts potentiels.
        return { success: false, message: `Erreur lors du pairing: ${error.message}` };
    }
}

// Export de la fonction principale (le contrôleur)
exports.pairing = async (req, res) => {
    // Validation basique des entrées
    const { ip, adminUser, adminPass, configName } = req.body;
    if (!ip || !adminUser || !adminPass || !configName) {
        logTrace("Pairing échoué: Données manquantes dans la requête.");
        return res.status(400).json({ success: false, message: "Données manquantes (ip, adminUser, adminPass, configName)." });
    }

    // Appel de la logique de pairing (qui est synchrone ici avec execSync)
    logTrace(`Requête de pairing reçue pour ${configName}...`);
    const result = pairingServer(ip, adminUser, adminPass, configName);

    // Réponse HTTP
    if (result.success) {
        logTrace(`Pairing réussi pour ${configName}. Réponse envoyée au client.`);
        // Ne pas renvoyer le chemin complet de la config dans la réponse finale peut être plus sûr
        res.json({ success: true, message: result.message /*, configName: configName */ });
    } else {
         logTrace(`Pairing échoué pour ${configName}. Raison: ${result.message}. Réponse envoyée au client.`);
        res.status(500).json({ success: false, message: result.message });
    }
};

// Fonction pour annuler le pairing avec un serveur SSH (Corrigée)
function unpairing(configName) {
    const configPath = path.join(__dirname, '../configs/tunnels', `${configName}.json`);
    let config;
    let pubKeyPath;
    let keyPath;

    try {
        // Étape 1 : Lire la configuration locale

        config = readTunnelsConfig(configName); // Supposons que cela parse le JSON
        if (!config || !config.ip || !config.user || !config.ssh_key) {
             throw new Error(`Configuration invalide ou incomplète pour ${configName}`);
        }
        keyPath = config.ssh_key; // Chemin de la clé privée
        pubKeyPath = `${keyPath}.pub`; // Chemin de la clé publique

        logTrace(`Tentative d'annulation du pairing pour ${config.user}@${config.ip}...`);

        // Étape 2 : Lire le contenu de la clé publique locale
        if (!fs.existsSync(pubKeyPath)) {
            // Si la clé publique n'existe pas localement, on ne peut pas la supprimer à distance
            // On pourrait continuer pour supprimer les fichiers locaux restants, ou s'arrêter.
            // Ici, on choisit de continuer pour nettoyer au maximum.
            logTrace(`Clé publique locale introuvable (${pubKeyPath}), suppression à distance impossible. Nettoyage local uniquement.`);
        } else {
            const pubKeyContent = fs.readFileSync(pubKeyPath, 'utf-8').trim();
            // Échapper les caractères spéciaux pour sed/grep si nécessaire (la clé SSH standard est généralement sûre)
            // Pour plus de robustesse, on pourrait échapper, mais essayons sans d'abord.
            const escapedPubKey = pubKeyContent.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/\`/g, '\\`').replace(/\"/g, '\\"');


            // Étape 3 : Supprimer la clé publique du fichier authorized_keys distant
            logTrace(`Suppression de la clé publique de authorized_keys sur ${config.user}@${config.ip}...`);
            // Commande pour supprimer la ligne exacte contenant la clé publique
            // Utilisation de grep -vF pour traiter la clé comme une chaîne fixe et l'exclure
            const remoteCmd = `
                if [ ! -f ~/.ssh/authorized_keys ]; then
                    echo "authorized_keys non trouvé.";
                    exit 0; # Pas une erreur si le fichier n'existe pas
                fi &&
                echo 'Sauvegarde de authorized_keys...' &&
                cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak_$(date +%s) &&
                echo 'Filtrage de la clé...' &&
                grep -vF "${escapedPubKey}" ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp &&
                echo 'Mise à jour de authorized_keys...' &&
                mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys &&
                chmod 600 ~/.ssh/authorized_keys &&
                echo 'Clé publique supprimée avec succès.'
            `;
            // Note : L'option StrictHostKeyChecking=no peut être nécessaire si l'hôte n'est pas dans known_hosts
            const sshCmd = `ssh -i '${keyPath}' -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${config.user}@${config.ip} "${remoteCmd}"`;

            try {
                execSync(sshCmd, { stdio: 'inherit' }); // 'inherit' pour voir les echos distants
                 logTrace('Clé publique supprimée avec succès du serveur distant.');
            } catch (sshError) {
                 // Ne pas bloquer la suppression locale même si la suppression distante échoue
                logTrace(`AVERTISSEMENT: Échec de la suppression de la clé publique distante pour ${configName}. Erreur: ${sshError.message}`);
                logTrace("Continuation avec la suppression des fichiers locaux.");
                 // Vous pourriez vouloir retourner une erreur partielle ici si la suppression distante est critique
            }
        }


        // Étape 4 : Supprimer les clés SSH locales (privée et publique)
        logTrace(`Suppression des clés locales pour ${configName}...`);
        if (fs.existsSync(keyPath)) {
            fs.unlinkSync(keyPath);
            logTrace(`Clé privée ${keyPath} supprimée.`);
        } else {
             logTrace(`Clé privée ${keyPath} non trouvée.`);
        }
        if (fs.existsSync(pubKeyPath)) {
            fs.unlinkSync(pubKeyPath);
             logTrace(`Clé publique ${pubKeyPath} supprimée.`);
        } else {
             logTrace(`Clé publique ${pubKeyPath} non trouvée.`);
        }


        // Étape 5 : Supprimer le fichier de configuration local
        logTrace(`Suppression du fichier de configuration local ${configPath}...`);
        // configPath est déjà défini au début
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
             logTrace(`Fichier de configuration ${configPath} supprimé.`);
        } else {
             logTrace(`Fichier de configuration ${configPath} non trouvé.`);
        }

        logTrace(`Unpairing de ${configName} terminé.`);
        return { success: true, message: `Unpairing de ${configName} terminé (la suppression distante peut avoir échoué, voir logs).` };

    } catch (error) {
        console.error(`Erreur lors de l'unpairing de ${configName}:`, error.message);
        // Retourner les détails de l'erreur pour le débogage côté client si nécessaire
        return { success: false, message: `Erreur lors de l'unpairing: ${error.message}` };
    }
}

// L'export reste le même
exports.unpairing = async (req, res) => {
    const configName = req.params.tunnelId;
    logTrace(`Requête d'unpairing reçue pour ${configName}...`);

    try {
        const result = unpairing(configName);
        if (result.success) {
            // Même si la suppression distante a échoué, on considère l'opération locale comme un succès partiel
            res.json({ success: true, message: result.message });
        } else {
            // Une erreur s'est produite lors de la lecture/suppression locale
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        // Erreur inattendue dans le wrapper async
        logTrace(`Erreur inattendue dans le handler exports.unpairing pour ${configName}: ${error.message}`);
        res.status(500).json({ success: false, message: `Erreur serveur interne lors de l'unpairing: ${error.message}` });
    }
};
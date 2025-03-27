const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const tunnelConfigPath = path.join(__dirname, '../configs/tunnels/');
const pidDir = path.join(__dirname, '../configs/pid');
const readTunnelsConfig = require('../utils/readTunnelsConfig'); // Fonction pour lire la config
const buildCmd = require('../utils/buildCmd'); // Fonction pour générer la commande
const { get } = require('http');
const { error } = require('console');

// Assure-toi que le dossier PID existe
if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
}

// Fonction pour supprimer le PID d'un tunnel en cas d'erreur
const removePid = async (tunnelId) => {
    try {
        const pidPath = path.join(pidDir, `${tunnelId}.pid`);
        if (fs.existsSync(pidPath)) {
            await fs.promises.unlink(pidPath);
        }
    } catch (error) {
        console.error(`Erreur de suppression du PID pour ${tunnelId}:`, error);
    }
};

const getTunnelPid = (tunnelId) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);
    if (!fs.existsSync(pidPath)) return null;
    
    const pid = fs.readFileSync(pidPath, 'utf-8').trim() * 1;
    return pid && process.kill(pid, 0) ? pid : null;
};

const storeTunnelPid = (tunnelId, pid) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);
    fs.writeFileSync(pidPath, pid, 'utf-8');
};
// lis la ligne de commande du processus avec ps -f -p <pid> -o cmd=
const getCurrentCMD = (pid) => {
    try {
        const stdout = execSync(`ps -f -p ${pid} -o cmd=`, { encoding: 'utf-8' });
        return stdout.trim();
    } catch (error) {
        console.error(`Erreur lors de la récupération de la commande pour PID ${pid}:`, error);
        return null;
    }
};
const startSingleTunnel = (id) => {

    const pid = getTunnelPid(id);
    logTrace(id, 'pid:',pid);

    // Vérifier si un tunnel est déjà en cours
    if (pid) {
        const cmd = getCurrentCMD(pid); // Fonction hypothétique pour obtenir la commande associée au PID
        if (cmd.match(/autossh/)) {
            return {
                success: true,
                id,
                pid: pid,
                cmd: cmd,
                status: "running",
                message: "Tunnel déjà en cours d'exécution.",
            };
        } else {
            removePid(id); // Fonction hypothétique pour supprimer un PID invalide
        }
    }
    try {
        // Lire la configuration du tunnel
        const config = readTunnelsConfig(id); // Fonction hypothétique pour lire la config
    logTrace(id, 'conf:',config);

        if (!config) {
            return {
                success: false,
                id,
                pid: null,
                cmd: null,
                status: "error",
                message: "Tunnel non trouvé.",
            };
        }

        // Préparer le fichier PID et la commande
        const pidFile = path.join(pidDir, `${id}.pid`);
        const cmd = buildCmd(config);
        const env = { ...process.env, AUTOSSH_PIDFILE: pidFile }; // Définir le fichier PID pour autossh

        // Lancer autossh en mode détaché avec execSync
        execSync(cmd, { env, detached: true}, error => {
            if (error) {
                results.push({ id, pid: null, cmd, status: "error", message: error.message });
                return;
            }
        });
        const pid = getTunnelPid(id);
        if (pid) {
            return {
                success: true,
                id,
                pid: pid,
                cmd: cmd,
                status: "running",
                message: "Démarré avec succès.",
            };
        } else {
            return {
                success: false,
                id,
                pid: null,
                cmd: cmd,
                status: "error",
                message: "Le fichier PID n'a pas été créé.",
            };
        }
    } catch (error) {
        return {
            success: false,
            id,
            pid: null,
            cmd: null,
            status: "error",
            message: error.message,
        };
    }
};
exports.startTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    let tunnels = [];
    logTrace("("+tunnelId+")");


    // Cas où aucun tunnelId n'est spécifié : démarrer tous les tunnels
    if (!tunnelId) {
        const files = fs.readdirSync(tunnelConfigPath);
        if (!files.length) {
            return res.status(404).json({
                success: false,
                message: "Aucun tunnel configuré.",
                tunnels: []
            });
        }

        tunnels = await Promise.all(
            files.map(async (file) => {
                const id = file.replace(".json", "");
                return startSingleTunnel(id);
            })
        );
    } else {
        // Démarrer un tunnel spécifique
        tunnels.push(startSingleTunnel(tunnelId));
    }

    // Construire la réponse finale
    const response = {
        success: tunnels.every(tunnel => tunnel.success), // Vrai si tous les tunnels ont réussi
        message: "Tous les tunnels ont été demarré.",
        tunnels: tunnels
    };

    return res.status(200).json(response);
};
const stopSingleTunnel = (id) => {
    const pidFile = path.join(pidDir, `${id}.pid`);

    try {
        const pid = getTunnelPid(id);
        process.kill(pid, 'SIGTERM');
        // fs.unlinkSync(pidFile);
        console.log("id", id);

        result = {
            success: true,
            id,
            pid,
            cmd: null,
            status: "stopped",
            message: `Tunnel arrêté avec succès.` };
    } catch (error) {
        result = {
            success: false,
            id,
            pid,
            cmd: null,
            status: "error",
            message: `Erreur lors de l'arrêt du tunnel: ${error.message}` };
    } finally {
        fs.unlinkSync(pidFile);
    }
    return result;
};
exports.stopTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;

    try {
        const pidFiles = fs.readdirSync(pidDir).filter(file => file.endsWith('.pid'));
        if (pidFiles.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Aucun tunnel en cours d'exécution." });
        }
        if (tunnelId) {
            // Arrêter un tunnel spécifique
            pidFiles = pidFiles.filter(file => file.startsWith(tunnelId));
        }

        const result = pidFiles.map(file => {
            const id = path.basename(file, '.pid');
            return stopSingleTunnel(id);
        });
        return res.status(200).json({
            success: result.every(tunnel => tunnel.success),
            message: "Tous les tunnels ont été arrêtés.",
            tunnels: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Erreur lors de l'arrêt des tunnels: ${error.message}`
        });
    }
};

exports.restartTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;

    try {
        if (!tunnelId) {
            // Redémarrer tous les tunnels
            const pidFiles = fs.readdirSync(pidDir).filter(file => file.endsWith('.pid'));

            if (pidFiles.length === 0) {
                return res.status(404).json({ success: false, message: "Aucun tunnel en cours d'exécution." });
            }

            const results = await Promise.all(pidFiles.map(async (file) => {
                const id = path.basename(file, '.pid');
                await stopSingleTunnel(id);
                return await startSingleTunnel(id);
            }));

            return res.status(200).json({ success: true, message: "Tous les tunnels ont été redémarrés.", details: results });
        } else {
            // Redémarrer un tunnel spécifique
            await stopSingleTunnel(tunnelId);
            const result = await startSingleTunnel(tunnelId);

            return res.status(result.success ? 200 : 500).json(result);
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: `Erreur lors du redémarrage des tunnels: ${error.message}` });
    }
};


// Vérifier l'état d'un tunnel
exports.getStatus = (req, res) => {
    const tunnelId = req.params.tunnelId;
    const tunnels = readTunnelsConfig(tunnelId);

    if (tunnelId) {
        // Retourner le statut d'un tunnel spécifique

    }

    // Retourner l'état de tous les tunnels
    return res.status(200).json(tunnels);
};

exports.checkTunnel = async (req, res) => {
    try {
        const result = await tunnelService.checkTunnel(req.params.id);
        res.json({ success: true, message: "Test SSH réussi.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.pairing = async (req, res) => {
    try {
        const result = await tunnelService.pairing(req.body);
        res.json({ success: true, message: "Tunnel ajouté.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.unpairing = async (req, res) => {
    try {
        const result = await tunnelService.unpairing(req.params.id);
        res.json({ success: true, message: "Tunnel supprimé.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addPortForward = async (req, res) => {
    try {
        const result = await tunnelService.addPortForward(req.params.id, req.body);
        res.json({ success: true, message: "Port ajouté.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.removePortForward = async (req, res) => {
    try {
        const result = await tunnelService.removePortForward(req.params.id, req.params.type, req.params.port);
        res.json({ success: true, message: "Port supprimé.", result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const tunnelConfigPath = path.join(__dirname, '../configs/tunnels/');
const pidDir = path.join(__dirname, '../configs/pid');
const scriptPath = path.join(__dirname, '../../scripts/start_tunnel.sh');

const tunnelService = require("../services/tunnel.service");

const readTunnelsConfig = require('../utils/readTunnelsConfig'); // Fonction pour lire la config
const buildCmd = require('../utils/buildCmd'); // Fonction pour générer la commande

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

const getStoredPid = (tunnelId) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);
    if (!fs.existsSync(pidPath)) return null;
    
    const pid = fs.readFileSync(pidPath, 'utf-8').trim();
    return pid && process.kill(pid, 0) ? pid : null;
};

const storePid = (tunnelId, pid) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);
    fs.writeFileSync(pidPath, pid, 'utf-8');
};

exports.startTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    let results = [];

    const startSingleTunnel = async (id) => {
        const existingPid = getStoredPid(id);
        if (existingPid) {
            return {
                id,
                pid: existingPid,
                cmd: null,
                status: "running",
                message: `Tunnel ${id} déjà en cours d'exécution.`,
            };
        }

        try {
            const config = readTunnelsConfig(id);
            if (!config) {
                return { id, pid: null, cmd: null, status: "error", message: "Tunnel non trouvé." };
            }

            const pidFile = path.join(pidDir, `${id}.pid`);
            const cmd = buildCmd(config);

            // Ajout de la variable d'environnement AUTOSSH_PIDFILE
            const env = { ...process.env, AUTOSSH_PIDFILE: pidFile };

            exec(cmd, { env, detached: true }, (error) => {
                if (error) {
                    results.push({ id, pid: null, cmd, status: "error", message: error.message });
                    return;
                }

                setTimeout(() => {
                    if (fs.existsSync(pidFile)) {
                        const autosshPid = fs.readFileSync(pidFile, 'utf-8').trim();
                        storePid(id, autosshPid);
                        results.push({ id, pid: autosshPid, cmd, status: "running", message: "Démarré avec succès." });
                    } else {
                        results.push({ id, pid: null, cmd, status: "error", message: "Le fichier PID n'a pas été créé." });
                    }
                }, 1000);
            });

            return { id, pid: null, cmd, status: "starting", message: "Démarrage en cours..." };
        } catch (error) {
            return { id, pid: null, cmd: null, status: "error", message: error.message };
        }
    };

    if (!tunnelId) {
        // Démarrer tous les tunnels configurés
        const files = fs.readdirSync(tunnelConfigPath);
        if (!files.length) {
            return res.status(404).json({ message: "Aucun tunnel configuré." });
        }

        results = await Promise.all(files.map((file) => startSingleTunnel(file.replace(".json", ""))));
    } else {
        // Démarrer un tunnel spécifique
        const result = await startSingleTunnel(tunnelId);
        results.push(result);
    }

    return res.status(200).json(results || []);
};


exports.stopTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;

    try {
        if (!tunnelId) {
            // Arrêter tous les tunnels
            const pidFiles = fs.readdirSync(pidDir).filter(file => file.endsWith('.pid'));

            if (pidFiles.length === 0) {
                return res.status(404).json({ success: false, message: "Aucun tunnel en cours d'exécution." });
            }

            const results = pidFiles.map(file => {
                const id = path.basename(file, '.pid');
                return stopSingleTunnel(id);
            });

            return res.status(200).json({ success: true, message: "Tous les tunnels ont été arrêtés.", details: results });
        } else {
            // Arrêter un tunnel spécifique
            const result = stopSingleTunnel(tunnelId);
            if (!result.success) {
                return res.status(404).json(result);
            }

            return res.status(200).json(result);
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: `Erreur lors de l'arrêt des tunnels: ${error.message}` });
    }
};

const stopSingleTunnel = (tunnelId) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);

    if (!fs.existsSync(pidPath)) {
        return { success: false, tunnelId, message: `Tunnel ${tunnelId} non trouvé ou déjà arrêté.` };
    }

    try {
        const pid = fs.readFileSync(pidPath, 'utf-8').trim();
        if (!pid) {
            return { success: false, tunnelId, message: `PID introuvable pour ${tunnelId}.` };
        }

        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(pidPath);

        return { success: true, tunnelId, pid, message: `Tunnel ${tunnelId} arrêté avec succès.` };
    } catch (error) {
        return { success: false, tunnelId, message: `Erreur lors de l'arrêt du tunnel: ${error.message}` };
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

const startSingleTunnel = async (tunnelId) => {
    try {
        const startModule = require('./tunnel.controllers'); // Importer startTunnel
        const fakeReq = { params: { tunnelId } };
        const fakeRes = {
            status: (code) => ({
                json: (data) => ({ code, ...data }),
            }),
        };

        return await startModule.startTunnel(fakeReq, fakeRes);
    } catch (error) {
        return { success: false, tunnelId, message: `Erreur lors du démarrage du tunnel: ${error.message}` };
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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readTunnelsConfig, writeTunnelsConfig } = require('../utils/rwTunnelsConfig'); // Fonction pour lire la config
const { buildCmd } = require('../utils/buildCmd'); // Fonction pour générer la commande
const { logTrace, sleep } = require('../utils/tools'); // Fonction pour tracer les logs
const { log } = require('util');
const { trace } = require('console');

const tunnelDir = path.join(__dirname, '../configs/tunnels/');
const pidDir = path.join(__dirname, '../configs/pid');

if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
}

// Fonction pour supprimer le PID d'un tunnel en cas d'erreur
const removePid = async (tunnelId) => {
    try {
        const pidPath = path.join(pidDir, `${tunnelId}.pid`);
        if (fs.existsSync(pidPath)) {
            logTrace(`Suppression du fichier PID pour ${tunnelId}`);
            await fs.promises.unlink(pidPath);
        }
    } catch (error) {
        console.error(`Erreur de suppression du PID pour ${tunnelId}:`, error);
    }
};
// Fonction pour obtenir le PID d'un tunnel
const getTunnelPid = (tunnelId) => {
    const pidPath = path.join(pidDir, `${tunnelId}.pid`);
    if (!fs.existsSync(pidPath)) return null;

    let countMax = 100;
    let pid = null;
    while (!pid && countMax > 0) {
    // on attend que le fichier pid soit rempli / lisible
        sleep(20);
        countMax--;
        pid = fs.readFileSync(pidPath, 'utf-8').trim() * 1;
    }
    try {
        const stdout = execSync(`ps -f -p ${pid} -o pid=`, { encoding: 'utf-8' });
        return stdout.trim();
    }
    catch (error) {
        fs.promises.unlink(pidPath);
        return null;
    }
};

// lis la ligne de commande du processus avec ps -f -p <pid> -o cmd=
const getPidCMD = (pid) => {
    try {
        const stdout = execSync(`ps -f -p ${pid} -o cmd=`, { encoding: 'utf-8' });
        return stdout.trim();
    } catch (error) {
        console.error(`Erreur lors de la récupération de la commande pour PID ${pid}:`, error);
        return null;
    }
};

// Fonction pour démarrer un tunnel autoSSH
const startSingleTunnel = (id) => {
    const pid = getTunnelPid(id);
    // Vérifier si un tunnel est déjà en cours
    if (pid) {
        const cmd = getPidCMD(pid); // Fonction hypothétique pour obtenir la commande associée au PID
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
        // logTrace(`Configuration du tunnel ${id}:`, config);
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
        // logTrace(`Fichier PID pour ${id}:`, pidFile);
        const cmd = buildCmd(config);
        logTrace(`Commande pour ${id}:`, cmd);
        const env = { ...process.env, AUTOSSH_PIDFILE: pidFile }; // Définir le fichier PID pour autossh

        // Lancer autossh en mode détaché avec execSync
        execSync(cmd, { env, detached: true}, error => {
            if (error) {
                results.push({ id, pid: null, cmd, status: "error", message: error.message });
                return;
            }
        });

        let countMax = 100;
        let pidFileExist = false;
        while (!pidFileExist && countMax > 0) {
        // on attend que le fichier pid apparaisse
            countMax--;
            sleep(50);
            pidFileExist = fs.existsSync(pidFile);
        }

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

// main fonctions API REST pour démarrer un ou tous les tunnels
exports.startTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    let tunnels = [];

    // Cas où aucun tunnelId n'est spécifié : démarrer tous les tunnels
    if (!tunnelId) {
        const files = fs.readdirSync(tunnelDir);
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
        message: tunnels.count > 1 ? "Tous les tunnel(s) ont été demarré." : tunnels[0].message,
        tunnels: tunnels
    };
    return res.status(200).json(response);
};

// Fonction pour arrêter un tunnel
const stopSingleTunnel = (id) => {
    const pidFile = path.join(pidDir, `${id}.pid`);

    try {
        const pid = getTunnelPid(id);
        if (pid) {
            process.kill(pid, 'SIGTERM', (error) => { if (error) console.error(error); });
            fs.unlink(pidFile, (error) => { });
            result = {
                success: true,
                id,
                pid,
                cmd: null,
                status: "stopped",
                message: `Tunnel arrêté avec succès.` };
        } else {
            result = {
                success: false,
                id,
                pid: null,
                cmd: null,
                status: "stopped",
                message: `Tunnel deja a l'arret.` };
        }

    } catch (error) {
        result = {
            success: false,
            id,
            pid,
            cmd: null,
            status: "error",
            message: `Erreur lors de l'arrêt du tunnel: ${error.message}` };
    }
    return result;
};

// main fonctions API REST pour arreter un ou tous les tunnels
exports.stopTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;

    try {
        let pidFiles = fs.readdirSync(pidDir).filter(file => file.endsWith('.pid'));
        if (pidFiles.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Aucun tunnel en cours d'exécution." ,
                tunnels: []
            });
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
            message: result.count > 1 ? "Tous les tunnel(s) ont été arrêtés." : result[0].message,
            tunnels: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Erreur lors de l'arrêt des tunnels: ${error.message}`,
            tunnels: []
        });
    }
};

// Fonction pour redémarrer un tunnel
const restartSingleTunnel = (id) => {
    const pidFile = path.join(pidDir, `${id}.pid`);
    let result = {};
    try {
        let pid = getTunnelPid(id);
        if (pid) {
            process.kill(pid, 'SIGTERM', (error) => { if (error) console.error(error); });
            fs.unlink(pidFile, (error) => { });
        }

        let countMax = 100;
        let pidFileExist = true;
        while (pidFileExist && countMax > 0) {
        // on attend que le fichier pid disparaisse
            countMax--;
            sleep(50);
            pidFileExist = fs.existsSync(pidFile);
        }
        result = startSingleTunnel(id);
        result.success = (pid!=result.pid && result.pid!=null);
    console.log(result);

    } catch (error) {
        result = {
            success: false,
            id,
            pid: null,
            cmd: null,
            status: "error",
            message: `Erreur lors du redémarrage du tunnel: ${error.message}` };
    }
    return result;
}

// main fonctions API REST pour redemarrer un ou tous les tunnels
exports.restartTunnel = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    try {
        let pidFiles = fs.readdirSync(pidDir).filter(file => file.endsWith('.pid'));

        if (pidFiles.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Aucun tunnel en cours d'exécution.",
                tunnels: []
            });
        }

        if (tunnelId) {
            // Redémarrer un tunnel spécifique
            pidFiles = pidFiles.filter(file => file.startsWith(tunnelId));
        }

        const result = pidFiles.map(file => {
            const id = path.basename(file, '.pid');
            return restartSingleTunnel(id);
        });

        return res.status(200).json({
            success: result.every(tunnel => tunnel.success),
            message: result.count > 1 ? "Tous les tunnel(s) ont été redémarrés." : result[0].message,
            tunnels: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Erreur lors du redémarrage des tunnels: ${error.message}`,
            tunnels: []
        });
    }
};

// main fonctions API REST pour obtenir l'état de tous les tunnels ou un seul tunnel
exports.getStatus = async (req, res) => {
    const tunnelId = req.params.tunnelId;

    // Fonction pour lister tous les processus autossh en cours
    const getRunningAutosshProcesses = () => {
        try {
            const output = execSync("ps -ef | grep autossh | grep : | grep -v grep", { encoding: 'utf-8' });
            return output.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const match = line.match(/^\S+\s+(\d+).*?(autossh\s+.*)/);
                    return match ? { pid: parseInt(match[1]), cmd: match[2] } : null;
                })
                .filter(p => p);
        } catch (error) {
            return [];
        }
    };

    const getSingleTunnelStatus = (id, config) => {
        const pid = getTunnelPid(id);
        const managedProcess = pid ? { pid, cmd: getPidCMD(pid) } : null;
        
        return {
            success: managedProcess ? true : false,
            id,
            ip: config.ip,
            ssh_port: config.ssh_port,
            ssh_key: config.ssh_key,
            options: config.options,
            channels: config.channels,
            bandwidth: config.bandwidth,
            pid: pid*1 || null,
            cmd: (managedProcess?.cmd) || null,
            status: managedProcess ? "running" : "stopped",
            message: managedProcess ? "Tunnel en cour d'execution" : "Tunnel arreté",
        };
    };

    try {
        let tunnels = [];
        const runningProcesses = getRunningAutosshProcesses();
        const configFiles = fs.readdirSync(tunnelDir); // Liste des fichiers de config

        // Tunnels configurés
        const configuredTunnels = configFiles.map(file => {
            const id = file.replace('.json', '');
            const config = readTunnelsConfig(id);
            return getSingleTunnelStatus(id, config);
        });

        // Tunnels non configurés (orphelins)
        const unmanagedTunnels = runningProcesses
            .filter(p => !configuredTunnels.some(t => t.pid == p.pid))
            .map(p => ({
                success: true,
                id: null,
                pid: p.pid,
                cmd: p.cmd,
                status: "orphan",
                message: "Processus orphelin non géré"
            }));

        tunnels = [...configuredTunnels, ...unmanagedTunnels];

        // Filtre par tunnelId si spécifié
        if (tunnelId) {
            tunnels = tunnels.filter(t => t.id === tunnelId);
        }

        // Calcul des stats
        const activeTunnels = tunnels.filter(t => t.status === 'running').length;
        const configTunnels = tunnels.filter(t => t.id != null).length;

        return res.status(200).json({
            success: true,
            message: tunnels.length > 0
                ? `${activeTunnels}/${configTunnels} tunnels actifs (${unmanagedTunnels.length} non gérés)`
                : "Aucun tunnel détecté",
            tunnels
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Erreur lors de la récupération du statut: ${error.message}`,
            tunnels: []
        });
    }
};

// main fonctions API REST pour modifier la bandwith d'un tunnel
exports.setBandwidth = async (req, res) => {
    const tunnelId = req.params.tunnelId;
    const { up, down } = req.body;

    try {
        const config = readTunnelsConfig(tunnelId);
        if (!config) {
            return res.status(404).json({
                success: false,
                message: `Tunnel ${tunnelId} non trouvé.`,
            });
        }

        config.bandwidth = { up, down };
        writeTunnelsConfig(tunnelId, config);

        return res.status(200).json({
            success: true,
            message: `Bande passante du tunnel ${tunnelId} modifiée.`,
            config
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Erreur lors de la modification de la bande passante: ${error.message}`,
        });
    }
};
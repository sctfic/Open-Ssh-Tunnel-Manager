const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const tunnelsDir = path.join(__dirname, "../config/tunnels");

exports.startTunnel = async (id) => {
    const tunnelConfig = loadTunnelConfig(id);
    const cmd = buildAutosshCommand(tunnelConfig);
    return executeCommand(cmd);
};

exports.stopTunnel = async (id) => {
    return executeCommand(`pkill -f "autossh .* ${id}"`);
};

exports.restartTunnel = async (id) => {
    await this.stopTunnel(id);
    return this.startTunnel(id);
};

exports.getStatus = async (id) => {
    return executeCommand(`pgrep -fl "autossh .* ${id}"`);
};

exports.checkTunnel = async (id) => {
    const tunnelConfig = loadTunnelConfig(id);
    return executeCommand(`ssh -i ${tunnelConfig.ssh_key} ${tunnelConfig.user}@${tunnelConfig.ip} -p ${tunnelConfig.ssh_port} -o BatchMode=yes -o ConnectTimeout=5 exit`);
};

exports.pairing = async (config) => {
    const id = generateTunnelId(config);
    fs.writeFileSync(path.join(tunnelsDir, `${id}.json`), JSON.stringify(config, null, 4));
    return executeCommand(`ssh-keygen -t rsa -b 4096 -f ${config.ssh_key} -N "" && ssh-copy-id -i ${config.ssh_key}.pub ${config.user}@${config.ip} -p ${config.ssh_port}`);
};

exports.unpairing = async (id) => {
    fs.unlinkSync(path.join(tunnelsDir, `${id}.json`));
    return executeCommand(`ssh -i ${config.ssh_key} ${config.user}@${config.ip} -p ${config.ssh_port} "rm -f ~/.ssh/authorized_keys"`);
};

exports.addPortForward = async (id, forward) => {
    const tunnelConfig = loadTunnelConfig(id);
    tunnelConfig.tunnels[forward.type][forward.listen_port] = forward;
    fs.writeFileSync(path.join(tunnelsDir, `${id}.json`), JSON.stringify(tunnelConfig, null, 4));
    return `Port ajouté: ${forward.listen_port}`;
};

exports.removePortForward = async (id, type, port) => {
    const tunnelConfig = loadTunnelConfig(id);
    delete tunnelConfig.tunnels[type][port];
    fs.writeFileSync(path.join(tunnelsDir, `${id}.json`), JSON.stringify(tunnelConfig, null, 4));
    return `Port ${port} supprimé`;
};

// 📌 Fonctions utilitaires
const loadTunnelConfig = (id) => JSON.parse(fs.readFileSync(path.join(tunnelsDir, `${id}.json`)));
const executeCommand = (cmd) => new Promise((resolve, reject) => exec(cmd, (err, stdout, stderr) => err ? reject(stderr) : resolve(stdout)));
const buildAutosshCommand = (config) => `trickle -u ${config.bandwidth.up} -d ${config.bandwidth.down} autossh -M 0 -N -o ServerAliveInterval=${config.options.keepalive_interval} -i ${config.ssh_key} ${config.user}@${config.ip} -p ${config.ssh_port}`;

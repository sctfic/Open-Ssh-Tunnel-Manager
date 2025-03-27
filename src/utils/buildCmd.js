// Function to build the command based on the configuration
function buildCmd(config) {
    const { user, ip, ssh_port, ssh_key, options, bandwidth, tunnels } = config;
    let cmd = `trickle -s -u ${bandwidth.up} -d ${bandwidth.down} autossh -M 0 -f -N -i ${ssh_key} -p ${ssh_port} `;

    // Add options
    if (options) {
        for (const [key, value] of Object.entries(options)) {
            cmd += `-o ${key}=${value} `;
        }
    }

    // Add tunnels
    for (const [type, tunnelGroup] of Object.entries(tunnels)) {
        for (const [port, tunnel] of Object.entries(tunnelGroup)) {
            if (type === "-L") {
                cmd += `${type} ${tunnel.listen_port}:${tunnel.endpoint_host}:${tunnel.endpoint_port} `;
            } else if (type === "-R") {
                cmd += `${type} ${tunnel.listen_host}:${tunnel.listen_port}:${tunnel.endpoint_host}:${tunnel.endpoint_port} `;
            } else if (type === "-D") {
                cmd += `${type} ${tunnel.listen_port} `;
            }
        }
    }

    cmd += `${user}@${ip}`;
    return cmd;
}

module.exports = buildCmd;

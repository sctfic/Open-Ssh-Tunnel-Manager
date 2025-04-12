const { logTrace } = require("./tools");

// Function to build the command based on the configuration
function buildCmd(config) {
    const { user, ip, ssh_port, ssh_key, options, bandwidth, channels } = config;
    let cmd = `trickle -s -u ${bandwidth.up} -d ${bandwidth.down} autossh -M 0 -f -N -i ${ssh_key} -p ${ssh_port} `;

    // Add options
    if (options) {
        for (const [key, value] of Object.entries(options)) {
            cmd += `-o ${key}=${value} `;
        }
    }
    // Add channels
    for (const [type, channelGroup] of Object.entries(channels)) {
        for (const [port, channel] of Object.entries(channelGroup)) {
            if (type === "-L") {
                cmd += `${type} ${channel.listen_port}:${channel.endpoint_host}:${channel.endpoint_port} `;
            } else if (type === "-R") {
                cmd += `${type} ${channel.listen_host}:${channel.listen_port}:${channel.endpoint_host}:${channel.endpoint_port} `;
            } else if (type === "-D") {
                cmd += `${type} ${channel.listen_port} `;
            }
            // logTrace("channel", `${type} ${channel.listen_host}:${channel.listen_port}:${channel.endpoint_host}:${channel.endpoint_port}`);
        }
    }

    cmd += `${user}@${ip}`;
    return cmd;
}

module.exports = { buildCmd };

import net from 'node:net';
import { execFile } from 'node:child_process';

// ICMP part du backend directement vers la destination. Aucun shell n'interprète
// le nom d'hôte ; un délai borne aussi les machines qui filtrent les pings.
export function ping(host) {
  return new Promise(resolve => {
    const args = process.platform === 'win32' ? ['-n', '1', '-w', '2000', host] : ['-n', '-c', '1', '-W', '2', '--', host];
    execFile('ping', args, { timeout: 3000, windowsHide: true }, error => resolve(!error));
  });
}

export function tcpLocal(host, port) {
  return new Promise(resolve => {
    const socket = net.connect(port, host);
    const finish = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(2500, () => finish(false));
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
  });
}

// Le diagnostic TCP associe écoute effective et accès à la destination via SSH.
// Pour SOCKS, aucune destination fixe n'existe : ces deux tests sont inapplicables.
export async function diagnose(config, session) {
  const result = {};
  const endpoints = session ? await session.checkChannels() : {};
  for (const [type, channels] of Object.entries(config.tunnels)) {
    for (const [port, channel] of Object.entries(channels)) {
      const key = `${type}:${port}`;
      if (type === '-D') { result[key] = { tcp: null, icmp: null }; continue; }
      const host = channel.listen_host === '0.0.0.0' ? '127.0.0.1' : channel.listen_host === '::' ? '::1' : channel.listen_host;
      const listening = session && endpoints[key]?.reachable ? (type === '-L'
        ? await tcpLocal(host, channel.listen_port)
        : await session.checkRemoteListener(host, channel.listen_port)) : false;
      result[key] = { tcp: !!listening, icmp: await ping(channel.endpoint_host) };
    }
  }
  return result;
}

import net from 'node:net';
import { execFile } from 'node:child_process';

// Plafonds partagés entre toutes les requêtes : on parallélise les sondes sans
// ouvrir des milliers de sockets ou de processus ping en même temps sur le Pi.
function pool(limit) {
  let active = 0; const queue = [];
  const next = () => {
    while (active < limit && queue.length) {
      const { task, resolve, reject } = queue.shift(); active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; next(); });
    }
  };
  return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}
const tcpPool = pool(64), icmpPool = pool(32);
const pendingPings = new Map();

function sharedPing(host) {
  // Plusieurs channels ciblant la même machine partagent leur ping en cours.
  if (!pendingPings.has(host)) pendingPings.set(host,
    icmpPool(() => ping(host)).finally(() => pendingPings.delete(host)));
  return pendingPings.get(host);
}

// ICMP part du backend directement vers la destination. Aucun shell n'interprète
// le nom d'hôte ; un délai borne aussi les machines qui filtrent les pings.
export function ping(host) {
  return new Promise(resolve => {
    const start = performance.now();
    const args = process.platform === 'win32' ? ['-n', '1', '-w', '600', host] : ['-n', '-c', '1', '-W', '0.6', '--', host];
    execFile('ping', args, { timeout: 600, windowsHide: true }, (error, stdout) => {
      // iputils fournit le RTT réseau dans `time=… ms`. Le temps total du
      // processus sert de repli portable si le format de sortie diffère.
      const match = stdout?.match(/(?:time|temps)[=<]?\s*([0-9]+(?:[.,][0-9]+)?)\s*ms/i);
      const measured = Math.round((performance.now() - start) * 10) / 10;
      resolve({ ok: !error, latencyMs: error ? null : match ? Number(match[1].replace(',', '.')) : measured,
        error: !error ? null : error.code === 'ENOENT' ? 'ping-unavailable' : error.killed ? 'timeout' : 'unreachable' });
    });
  });
}

export function localPortAvailable(host, port) {
  return new Promise(resolve => {
    const server = net.createServer(); let finished = false;
    const finish = (available, error = null) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (server.listening) server.close(() => resolve({ available, error }));
      else resolve({ available, error });
    };
    // Une résolution de nom locale défaillante ne doit pas retenir la mutation.
    const timer = setTimeout(() => { server.close(); finish(false, 'timeout'); }, 1000);
    server.once('error', error => finish(false, error.code || 'listen-error'));
    server.listen({ host, port, exclusive: true }, () => finish(true));
  });
}

export function tcpLocal(host, port) {
  return new Promise(resolve => {
    const start = performance.now();
    const socket = new net.Socket(); let finished = false;
    const finish = (ok, error = null) => {
      if (finished) return; finished = true;
      resolve({ ok, latencyMs: ok ? Math.round((performance.now() - start) * 10) / 10 : null, error });
      // Mesurer l'établissement TCP, sans attendre de réponse applicative ni la
      // fermeture du port. Le half-close laisse SSH terminer proprement le flux.
      if (ok) { socket.end(); socket.resume(); } else socket.destroy();
    };
    // Délai absolu (DNS inclus), et non simple délai d'inactivité de la socket.
    const timer = setTimeout(() => { finish(false, 'timeout'); socket.destroy(); }, 600);
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(false, error.code || 'connection-error'));
    socket.once('close', () => { clearTimeout(timer); finish(false, 'connection-closed'); });
    try { socket.connect(port, host); }
    catch { clearTimeout(timer); finish(false, 'invalid-address'); }
  });
}

export async function diagnose(config, session = null) {
  const channels = Object.entries(config.tunnels).flatMap(([type, group]) =>
    Object.entries(group).map(([port, channel]) => ({ type, port, channel })));
  return Object.fromEntries(await Promise.all(channels.map(async ({ type, port, channel }) => {
    // -L : la destination est ouverte depuis le serveur SSH via forwardOut.
    // -R : la destination finale se trouve côté backend et est testée ici.
    // -D : aucune destination fixe n'existe avant une requête SOCKS.
    const tcpTask = type === '-L'
      ? session ? () => session.checkEndpoint(channel.endpoint_host, channel.endpoint_port, 600) : null
      : type === '-R' ? () => tcpLocal(channel.endpoint_host, channel.endpoint_port) : null;
    const [tcp, icmp] = await Promise.all([
      tcpTask ? tcpPool(tcpTask) : null,
      type === '-D' ? null : sharedPing(channel.endpoint_host)
    ]);
    // Une valeur numérique est une réussite et représente directement le délai.
    // null signale un échec ou un test inapplicable ; *Error en donne la cause.
    return [`${type}:${port}`, { tcp: tcp?.ok ? tcp.latencyMs : null,
      tcpError: tcp?.error ?? (type === '-L' && !session ? 'tunnel-stopped' : null),
      icmp: icmp?.ok ? icmp.latencyMs : null, icmpError: icmp?.error ?? null }];
  })));
}

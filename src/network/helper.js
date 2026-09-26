#!/usr/bin/env node
/**
 * Helper Linux privilégié.
 *
 * Ce fichier doit appartenir à root et être le seul point d'entrée autorisé dans
 * sudoers. Il n'utilise jamais de shell : commandes et arguments sont passés à
 * execFile pour éviter toute interprétation. Le backend lui demande cinq actions
 * bornées : setup, limits, stats, remove et connect (plus list en lecture).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, rm, rmdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { atomicJson, readJson } from '../store.js';
import { id, bandwidth } from '../schema.js';
const exec = promisify(execFile);
const stateDir = '/run/ostm-network';
export function names(key, slot) {
  // Les noms d'interface Linux sont limités à 15 caractères. Un hash stable évite
  // collisions visuelles, caractères invalides et troncature d'un long identifiant.
  id.parse(key);
  const suffix = createHash('sha256').update(key).digest('hex').slice(0, 10);
  return { ns: `ostm-${suffix}`, dev: `ot${suffix}`, host: `10.203.${slot}.1`, peer: `10.203.${slot}.2` };
}
const run = (cmd, args) => exec(cmd, args, { timeout: 10000, maxBuffer: 1024 * 1024, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' } });
const ip = args => run('/usr/sbin/ip', args);
const tc = args => run('/usr/sbin/tc', args);
function rules(s) {
  // Seule la destination SSH exacte est autorisée à sortir du namespace.
  // MASQUERADE traduit l'IP privée du veth vers celle de l'hôte.
  const n = names(s.id, s.slot);
  return [
    ['-t', 'nat', 'POSTROUTING', '-s', `${n.peer}/32`, '-d', `${s.host}/32`, '-p', 'tcp', '--dport', String(s.port), '-j', 'MASQUERADE'],
    ['FORWARD', '-i', n.dev, '-s', `${n.peer}/32`, '-d', `${s.host}/32`, '-p', 'tcp', '--dport', String(s.port), '-j', 'ACCEPT'],
    ['FORWARD', '-o', n.dev, '-d', `${n.peer}/32`, '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']
  ];
}
async function firewall(s, operation) {
  for (const rule of rules(s)) {
    const args = rule[0] === '-t' ? [rule[0], rule[1], operation, ...rule.slice(2)] : [operation, ...rule];
    // Une suppression est idempotente : une règle déjà absente n'est pas une panne.
    try { await run('/usr/sbin/iptables', ['-w', '3', ...args]); } catch (e) { if (operation !== '-D') throw e; }
  }
}
async function destroy(s) {
  const n = names(s.id, s.slot);
  // Terminate namespace transport processes before deleting the namespace.
  try {
    const { stdout } = await ip(['netns', 'pids', n.ns]);
    for (const pid of stdout.trim().split(/\s+/).filter(Boolean)) { try { process.kill(Number(pid), 'SIGTERM'); } catch {} }
  } catch {}
  // L'ordre retire d'abord les permissions pare-feu, puis les objets réseau et
  // enfin l'état disque qui permettrait de recommencer le nettoyage.
  await firewall(s, '-D');
  await ip(['link', 'del', n.dev]).catch(() => {});
  await ip(['netns', 'del', n.ns]).catch(() => {});
  await rm(path.join(stateDir, `${s.id}.json`), { force: true });
}
export function limitArgs(dev, rate) {
  // fq_codel conserve une file saine et les compteurs quand la limite vaut zéro.
  if (rate === 0) return ['qdisc', 'replace', 'dev', dev, 'root', 'fq_codel'];
  const bytes = Math.max(1, Math.round(rate * 1000));
  // TBF attend des bits/s. Le burst représente environ 50 ms avec un minimum
  // supérieur à un paquet Ethernet, pour rester utilisable à faible débit.
  return ['qdisc', 'replace', 'dev', dev, 'root', 'tbf', 'rate', `${bytes * 8}bit`, 'burst', String(Math.max(1600, Math.ceil(bytes / 20))), 'latency', '200ms'];
}
async function limits(s) {
  const n = names(s.id, s.slot);
  // Sur le veth hôte, l'egress va vers le namespace : c'est donc le Down.
  await tc(limitArgs(n.dev, s.down));
  // Dans le namespace, l'egress part vers le serveur distant : c'est le Up.
  await ip(['netns', 'exec', n.ns, '/usr/sbin/tc', ...limitArgs('transport0', s.up)]);
}
async function main() {
  // Une exécution non root serait partielle et laisserait un état incohérent.
  if (process.platform !== 'linux' || process.getuid() !== 0) throw new Error('Linux root helper required');
  const [action, key, ...args] = process.argv.slice(2);
  if (action === 'list') {
    // `list` ne consulte que les états créés par OSTM, jamais tous les processus SSH.
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const states = [];
    for (const name of await readdir(stateDir)) if (name.endsWith('.json')) states.push(await readJson(path.join(stateDir, name)));
    console.log(JSON.stringify(states.map(s => ({ id: s.id, namespace: names(s.id, s.slot).ns }))));
    return;
  }
  id.parse(key);
  if (!['setup', 'limits', 'stats', 'remove', 'connect'].includes(action)) throw new Error('Invalid action');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, `${key}.json`);
  // Serialize mutations across independent API/helper processes.
  const mutates = ['setup', 'limits', 'remove'].includes(action);
  const lock = path.join(stateDir, '.lock');
  // mkdir est atomique : si un autre helper mute le réseau, celui-ci échoue vite.
  if (mutates) await mkdir(lock);
  try {
    let s = await readJson(file, null);
    if (action === 'setup') {
      const [host, rawPort, rawUp, rawDown] = args;
      const port = Number(rawPort); const rates = bandwidth.parse({ up: Number(rawUp), down: Number(rawDown) });
      if (!isIPv4(host) || host.startsWith('127.') || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A routable IPv4 SSH endpoint is required');
      if ((await readFile('/proc/sys/net/ipv4/ip_forward', 'utf8')).trim() !== '1') throw new Error('Enable net.ipv4.ip_forward before using OSTM');
      if (s) await destroy(s);
      const used = [];
      for (const name of await readdir(stateDir)) if (name.endsWith('.json')) used.push((await readJson(path.join(stateDir, name))).slot);
      // Chaque slot reçoit un /30 dans 10.203.0.0/16 : .1 côté hôte, .2 côté namespace.
      const slot = Array.from({ length: 254 }, (_, i) => i + 1).find(x => !used.includes(x));
      if (!slot) throw new Error('Network capacity reached (254 tunnels)');
      s = { id: key, host, port, slot, ...rates }; const n = names(key, slot);
      // Persist first so an interrupted setup can be cleaned up on the next attempt.
      await atomicJson(file, s);
      try {
        // Topologie : réseau principal (veth hôte) <-> namespace (transport0)
        // <-> TCP SSH distant. Les autres sockets de l'application restent dehors.
        await ip(['netns', 'add', n.ns]);
        await ip(['link', 'add', n.dev, 'type', 'veth', 'peer', 'name', 'transport0', 'netns', n.ns]);
        await ip(['addr', 'add', `${n.host}/30`, 'dev', n.dev]);
        await ip(['link', 'set', n.dev, 'up']);
        await ip(['-n', n.ns, 'addr', 'add', `${n.peer}/30`, 'dev', 'transport0']);
        await ip(['-n', n.ns, 'link', 'set', 'transport0', 'up']);
        await ip(['-n', n.ns, 'link', 'set', 'lo', 'up']);
        await ip(['-n', n.ns, 'route', 'add', 'default', 'via', n.host]);
        await firewall(s, '-I'); await limits(s);
      } catch (e) { await destroy(s); throw e; }
      console.log(JSON.stringify({ ready: true }));
    } else {
      if (!s) { if (action === 'remove') return; throw new Error('Network not initialized'); }
      if (action === 'remove') await destroy(s);
      if (action === 'limits') {
        const next = { ...s, ...bandwidth.parse({ up: Number(args[0]), down: Number(args[1]) }) };
        // Rollback des qdisc si une des deux directions ne peut pas être modifiée.
        try { await limits(next); await atomicJson(file, next); } catch (e) { await limits(s); throw e; }
      }
      if (action === 'stats') {
        // RX du veth hôte = paquets émis par le namespace (Up), TX = paquets
        // injectés vers le namespace (Down). stats64 évite les compteurs 32 bits.
        const { stdout } = await ip(['-j', '-s', 'link', 'show', 'dev', names(key, s.slot).dev]);
        const stats = JSON.parse(stdout)[0].stats64;
        console.log(JSON.stringify({ upBytes: stats.rx.bytes, downBytes: stats.tx.bytes, source: 'linux-veth', networkOverheadIncluded: true }));
      }
      if (action === 'connect') {
        // Le relais hérite de stdin/stdout : le parent non privilégié peut fournir
        // cette paire de pipes à ssh2 comme s'il s'agissait d'une socket TCP.
        const { spawn } = await import('node:child_process');
        const child = spawn('/usr/sbin/ip', ['netns', 'exec', names(key, s.slot).ns, process.execPath, fileURLToPath(new URL('./relay.js', import.meta.url)), s.host, String(s.port)], { stdio: 'inherit', env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' } });
        process.on('SIGTERM', () => child.kill());
        child.on('error', () => { process.exitCode = 1; });
        child.on('exit', code => { process.exitCode = code ?? 1; });
      }
    }
  } finally { if (mutates) await rmdir(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });

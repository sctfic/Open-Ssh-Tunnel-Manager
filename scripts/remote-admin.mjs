/**
 * Client SSH interactif réservé au déploiement de test.
 *
 * Le mot de passe est lu sans écho, reste en mémoire et n'est jamais inclus dans
 * une commande ou un fichier. Les commandes suivantes arrivent en JSON sur stdin
 * pour exécuter et transférer sans reconnecter ni réexposer le secret.
 */
import ssh2 from 'ssh2';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
const [host, username, expectedFingerprint] = process.argv.slice(2);
if (!host || !username) throw new Error('Usage: node scripts/remote-admin.mjs HOST USER [SHA256:fingerprint]');
const client = new ssh2.Client();
async function password() {
  process.stdout.write('SSH password (hidden): ');
  if (!process.stdin.isTTY) throw new Error('A terminal is required for secret input');
  // Le mode raw empêche le terminal d'afficher les caractères du secret.
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise(resolve => {
    let value = '';
    const receive = chunk => {
      for (const c of chunk.toString()) {
        if (c === '\u0003') process.exit(130);
        if (c === '\r' || c === '\n') {
          process.stdin.off('data', receive); process.stdin.setRawMode(false); process.stdout.write('\n'); resolve(value); return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1); else value += c;
      }
    };
    process.stdin.on('data', receive);
  });
}
let secret = await password();
await new Promise((resolve, reject) => {
  client.once('ready', resolve); client.once('error', reject);
  client.connect({ host, username, password: secret, readyTimeout: 20000, keepaliveInterval: 10000,
    hostVerifier: key => {
      const fp = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
      console.log(`SSH host fingerprint: ${fp}`);
      // Avec une empreinte attendue, une clé hôte différente ferme la connexion.
      return !expectedFingerprint || fp === expectedFingerprint;
    }
  });
});
secret = undefined;
console.log('READY: JSON commands {action:exec,command}, {action:upload,local,remote}, {action:download,remote,local}, {action:close}');
client.on('error', e => console.error(`SSH connection: ${e.message}`));
let sftp;
const getSftp = async () => sftp ||= await new Promise((resolve, reject) => client.sftp((e, value) => e ? reject(e) : resolve(value)));
const input = readline.createInterface({ input: process.stdin, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  try {
    const command = JSON.parse(line);
    if (command.action === 'close') { input.close(); client.end(); break; }
    if (command.action === 'exec') {
      // Une limite empêche une commande bloquée de retenir la session indéfiniment.
      await new Promise((resolve, reject) => {
        client.exec(command.command, (err, stream) => {
          if (err) return reject(err);
          const timeout = setTimeout(() => { stream.close(); reject(new Error('Remote command timeout')); }, command.timeoutMs || 120000);
          stream.on('data', data => process.stdout.write(data)); stream.stderr.on('data', data => process.stderr.write(data));
          stream.on('close', (code, signal) => { clearTimeout(timeout); console.log(`\nRESULT exit=${code} signal=${signal || ''}`); resolve(); });
          stream.on('error', reject);
        });
      });
    } else if (command.action === 'upload' || command.action === 'download') {
      const transfer = await getSftp();
      await new Promise((resolve, reject) => command.action === 'upload'
        ? transfer.fastPut(command.local, command.remote, e => e ? reject(e) : resolve())
        : transfer.fastGet(command.remote, command.local, e => e ? reject(e) : resolve()));
      console.log('RESULT transfer=ok');
    } else throw new Error('Unknown action');
  } catch (e) { console.error(`RESULT error=${e.message}`); }
}
client.end();

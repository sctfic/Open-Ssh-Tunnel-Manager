import { Store } from '../src/store.js';
import { hashPassword } from '../src/auth.js';

// Cette commande s'utilise uniquement depuis un vrai terminal : le nouveau
// secret ne transite ni par une variable d'environnement ni par l'historique.
if (!process.stdin.isTTY) throw new Error('A terminal is required to enter the new password privately.');

function askSecret(prompt) {
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise(resolve => {
    let value = '';
    const receive = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') process.exit(130);
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', receive); process.stdin.setRawMode(false); process.stdout.write('\n'); resolve(value); return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else value += char;
      }
    };
    process.stdin.on('data', receive);
  });
}

const first = await askSecret('New root password (empty is allowed): ');
const confirmation = await askSecret('Confirm new root password: ');
if (first !== confirmation) throw new Error('Passwords do not match; root was not changed.');

const store = new Store(process.env.OSTM_DATA_DIR || 'data'); await store.init();
const users = await store.users();
if (!users.root) throw new Error('Root account does not exist; use the first-connection setup screen.');
users.root.passwordHash = await hashPassword(first);
await store.saveUsers(users);
console.log('Root password updated. Restart the OSTM service to invalidate active sessions.');

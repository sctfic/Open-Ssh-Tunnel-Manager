// Run as the ostm service account; never print or embed the generated password.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Store } from '../src/store.js';
import { hashPassword } from '../src/auth.js';
const store = new Store(process.env.OSTM_DATA_DIR || '/var/lib/ostm');
await store.init();
const users = await store.users();
if (!Object.hasOwn(users, 'root')) {
  const password = randomBytes(24).toString('base64url');
  await writeFile(store.file('initial-root-password'), `${password}\n`, { mode: 0o600, flag: 'wx' });
  users.root = { passwordHash: await hashPassword(password), rights: {}, disabled: false };
  await store.saveUsers(users);
  console.log('Initial root account created; password stored in the protected bootstrap file.');
} else console.log('Existing root account preserved.');

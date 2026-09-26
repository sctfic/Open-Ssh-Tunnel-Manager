import { Store } from './store.js';
import { hashPassword } from './auth.js';
import { password } from './schema.js';

// Initialisation volontairement séparée du serveur : le premier mot de passe
// root n'apparaît ni dans le dépôt ni dans une valeur par défaut du programme.
const store = new Store(process.env.OSTM_DATA_DIR || 'data');
await store.init();
const users = await store.users();
// Refuser tout écrasement protège un root existant d'une réinitialisation involontaire.
if (Object.hasOwn(users, 'root')) throw new Error('Root already exists; bootstrap refuses to overwrite it');
const secret = password.parse(process.env.OSTM_ROOT_PASSWORD);
users.root = { passwordHash: await hashPassword(secret), rights: {}, disabled: false };
await store.saveUsers(users);
console.log('Root account created. Remove OSTM_ROOT_PASSWORD from the environment.');

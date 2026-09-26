import { buildApp } from './app.js';

// Point d'entrée de production. Les secrets connus sont masqués dans les logs
// structurés Fastify avant toute sérialisation.
const app = await buildApp({ logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.privateKey'] } });
const users = await app.services.store.users();
// Un serveur sans root serait administrativement irrécupérable : refuser de
// démarrer indique clairement qu'il faut lancer `npm run bootstrap`.
if (!users.root || users.root.disabled) { await app.close(); throw new Error('Initialize root with npm run bootstrap before starting the backend'); }
await app.listen({ host: process.env.OSTM_HOST || '127.0.0.1', port: Number(process.env.PORT || 4000) });
// PM2 envoie SIGTERM. Attendre app.close() permet au Manager de fermer tunnels,
// sockets et processus privilégiés proprement.
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });

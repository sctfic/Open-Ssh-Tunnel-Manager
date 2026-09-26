import { buildApp } from './app.js';

// Point d'entrée de production. Les secrets connus sont masqués dans les logs
// structurés Fastify avant toute sérialisation.
const app = await buildApp({ logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.privateKey'] } });
// Le serveur démarre aussi sans compte root afin que l'interface puisse afficher
// l'assistant de première connexion. Dans cet état, seules les routes publiques
// de setup répondent sans authentification.
await app.listen({ host: process.env.OSTM_HOST || '127.0.0.1', port: Number(process.env.PORT || 4000) });
// PM2 envoie SIGTERM. Attendre app.close() permet au Manager de fermer tunnels,
// sockets et processus privilégiés proprement.
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });

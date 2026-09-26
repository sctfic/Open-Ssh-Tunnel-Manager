import { buildApp } from './app.js';
const app = await buildApp({ logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.privateKey'] } });
const users = await app.services.store.users();
if (!users.root || users.root.disabled) { await app.close(); throw new Error('Initialize root with npm run bootstrap before starting the backend'); }
await app.listen({ host: process.env.OSTM_HOST || '127.0.0.1', port: Number(process.env.PORT || 4000) });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });

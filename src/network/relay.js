/**
 * Relais extrêmement réduit exécuté dans le namespace réseau du tunnel.
 *
 * Il ne voit ni clés, ni configuration SSH, ni channels : il copie seulement les
 * octets chiffrés entre stdin/stdout et la socket du serveur. Ainsi, `tc` mesure
 * le transport SSH complet, tandis que les listeners applicatifs restent dans le
 * namespace principal et continuent d'accéder au LAN local.
 */
import net from 'node:net';
const socket = net.connect({ host: process.argv[2], port: Number(process.argv[3]) });
// Toute erreur coupe les deux directions ; le Manager déclenchera la reconnexion.
const fail = () => { socket.destroy(); process.exitCode = 1; process.stdin.destroy(); };
socket.setTimeout(15000, fail);
socket.on('connect', () => socket.setTimeout(0));
socket.on('error', fail);
process.stdin.on('error', fail);
process.stdout.on('error', fail);
process.stdin.pipe(socket).pipe(process.stdout);
socket.on('close', () => process.stdin.destroy());
process.on('SIGTERM', () => { socket.destroy(); process.exit(0); });

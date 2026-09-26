// Only carries the SSH transport. Forwarded application sockets stay outside the namespace.
import net from 'node:net';
const socket = net.connect({ host: process.argv[2], port: Number(process.argv[3]) });
const fail = () => { socket.destroy(); process.exitCode = 1; process.stdin.destroy(); };
socket.setTimeout(15000, fail);
socket.on('connect', () => socket.setTimeout(0));
socket.on('error', fail);
process.stdin.on('error', fail);
process.stdout.on('error', fail);
process.stdin.pipe(socket).pipe(process.stdout);
socket.on('close', () => process.stdin.destroy());
process.on('SIGTERM', () => { socket.destroy(); process.exit(0); });

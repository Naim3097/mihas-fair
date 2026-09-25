// The fair (and the rest of the site) served as the built app with the real API on one port, reachable on the local
// network: what "run it live" means before a public deployment. Dev-mode secrets and plain http, so cookies work on a
// phone on the same Wi-Fi; a public deployment sets MX_SECRET, CREW_PIN and https itself.
//   node --import tsx tools/live.mjs            (after npm run build)
import { networkInterfaces } from 'node:os';
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
process.env.API_PORT ??= '8787';
process.env.PUBLIC_ORIGIN ??= `http://${lan}:${process.env.API_PORT}`;
console.log(`[live] the fair: ${process.env.PUBLIC_ORIGIN}/  (this machine: http://localhost:${process.env.API_PORT}/)`); // the address a launcher named, if it knows the Wi-Fi's
await import('../server/node.ts');

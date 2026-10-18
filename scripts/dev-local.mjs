import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

// Read the existing Docker database configuration; never seed/reset/alter its rows.
const name = process.env.TRIYA_LOCAL_CONTAINER ?? 'triya-postgres';
const inspected = spawnSync('docker', ['inspect', name], { encoding: 'utf8' });
if (inspected.status !== 0) throw new Error('Start the existing Triya PostgreSQL container before running dev:local.');
const container = JSON.parse(inspected.stdout)[0];
const values = Object.fromEntries(container.Config.Env.map(value => {
  const split = value.indexOf('='); return [value.slice(0, split), value.slice(split + 1)];
}));
const port = container.NetworkSettings.Ports?.['5432/tcp']?.[0]?.HostPort;
if (!port || !values.POSTGRES_USER || !values.POSTGRES_PASSWORD || !values.POSTGRES_DB) throw new Error('The local PostgreSQL connection could not be resolved.');
const url = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@127.0.0.1:${port}/${encodeURIComponent(values.POSTGRES_DB)}`;
console.log('Using the existing local Triya database. Cloud environment settings are unchanged.');
const next = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [next, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, STORAGE_DRIVER: 'local' },
});
child.on('error', () => { console.error('Could not start the local Next.js server.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

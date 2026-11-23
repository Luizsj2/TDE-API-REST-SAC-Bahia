import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync(new URL('../.secrets/', import.meta.url), { recursive: true });
for (const name of ['api-key', 'postgres-password']) {
    try {
        writeFileSync(new URL('../.secrets/' + name, import.meta.url), randomBytes(24).toString('hex') + '\n',
            { flag: 'wx', mode: 0o600 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}
const result = spawnSync('docker', ['compose', 'up', '-d', '--build'], {
    cwd: new URL('..', import.meta.url), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

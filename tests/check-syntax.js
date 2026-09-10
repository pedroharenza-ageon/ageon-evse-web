import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of readdirSync('.').filter(name => name.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
}
JSON.parse(readFileSync('manifest.json', 'utf8'));
console.log('Sintaxe JavaScript e manifest.json válidos.');

import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
function sources(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(folder, entry.name);
        return entry.isDirectory() ? sources(file) : /\.(m?js)$/.test(file) ? [file] : [];
    });
}
const files = [...readdirSync('.').filter(name => name.endsWith('.js')), ...['js', 'tools', 'tests'].flatMap(sources)];
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
}
JSON.parse(readFileSync('manifest.json', 'utf8'));
console.log('Sintaxe JavaScript e manifest.json válidos.');

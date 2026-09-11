import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(fullPath);
    }
}

walk(root);

const errors = [];
const externalProtocols = /^(https?:|mailto:|tel:|javascript:|data:|#)/i;

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const source = path.relative(root, file) || 'index.html';

    for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
        const target = match[1].trim();
        if (!target || externalProtocols.test(target)) continue;

        const cleanTarget = target.split('#')[0].split('?')[0];
        if (!cleanTarget) continue;

        const resolved = path.resolve(path.dirname(file), cleanTarget);
        const candidates = path.extname(resolved)
            ? [resolved]
            : [path.join(resolved, 'index.html'), resolved + '.html', resolved];

        if (!candidates.some(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
            errors.push(`${source} -> ${target}`);
        }
    }
}

if (errors.length) {
    console.error('Broken local routes or asset links:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
}

console.log(`Route audit passed: checked ${htmlFiles.length} HTML files.`);

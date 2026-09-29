import { mkdir, writeFile } from 'node:fs/promises';

const cjsDir = new URL('../dist/cjs/', import.meta.url);
await mkdir(cjsDir, { recursive: true });
await writeFile(new URL('package.json', cjsDir), '{"type":"commonjs"}\n');

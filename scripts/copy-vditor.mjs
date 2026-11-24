import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules', 'vditor', 'dist');
const to = path.join(root, 'public', 'vditor', 'dist');

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`copied vditor assets -> ${to}`);

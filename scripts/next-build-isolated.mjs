import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, '../apps/admin-web');
const nextBinary = path.join(appDirectory, 'node_modules', 'next', 'dist', 'bin', 'next');
const generatedFiles = ['next-env.d.ts', 'tsconfig.json'];
const originals = new Map(generatedFiles.map((name) => {
  const filename = path.join(appDirectory, name);
  return [filename, fs.readFileSync(filename)];
}));
const result = spawnSync(process.execPath, [nextBinary, 'build'], {
  cwd: appDirectory,
  env: { ...process.env, NEXT_DIST_DIR: '.next-build' },
  stdio: 'inherit',
  shell: false,
});

for (const [filename, contents] of originals) fs.writeFileSync(filename, contents);

if (result.error) throw result.error;
process.exit(result.status ?? 1);

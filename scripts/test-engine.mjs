import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Bundle extensionless TypeScript imports before executing on Node.
const dir = await mkdtemp(join(tmpdir(), 'poker-iq-tests-'));
try {
  for (const name of process.argv.slice(2)) {
    const outfile = join(dir, `${name}.mjs`);
    await build({ entryPoints: [`scripts/${name}.ts`], outfile, bundle: true, platform: 'node', format: 'esm' });
    const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = result.status || 1;
    if (process.exitCode) break;
  }
} finally { await rm(dir, { recursive: true, force: true }); }

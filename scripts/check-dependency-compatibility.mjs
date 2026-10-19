import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rootRequire = createRequire(new URL('../package.json', import.meta.url));
const triggerRequire = createRequire(rootRequire.resolve('trigger.dev/package.json'));
const c12Path = triggerRequire.resolve('c12');
const req = createRequire(c12Path);
const fixture = await mkdtemp(join(tmpdir(), 'comp-giget-smoke-'));
process.env.XDG_CACHE_HOME = join(fixture, 'cache');
const { downloadTemplate } = await import(req.resolve('giget'));
const { loadConfig, watchConfig } = await import(c12Path);
console.log('UTC:', new Date().toISOString());
console.log('Runtime:', process.version, process.versions.bun);
console.log('Resolved giget:', req.resolve('giget'));
console.log('Resolved c12:', c12Path);
console.log('Fixture:', fixture);

try {
  const source = join(fixture, 'source');
  await mkdir(join(source, 'repo', 'nested', 'app'), { recursive: true });
  await writeFile(
    join(source, 'repo', 'nested', 'app', 'fixture.txt'),
    'expected-template-content\n',
  );
  await writeFile(join(source, 'repo', 'outside.txt'), 'must-not-extract\n');
  const archive = join(fixture, 'template.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', source, 'repo']);
  const archiveBytes = await readFile(archive);
  let hits = 0;
  const server = createServer((request, response) => {
    hits += 1;
    response.writeHead(200, { 'Content-Type': 'application/gzip' });
    response.end(archiveBytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  console.log('HTTP fixture:', `127.0.0.1:${address.port}`);
  const provider = () => ({
    name: 'local-fixture',
    version: 'v1',
    subdir: 'nested/app',
    tar: `http://127.0.0.1:${address.port}/template.tar.gz`,
  });
  const options = { providers: { fixture: provider }, registry: false, silent: true };
  const output = join(fixture, 'download');
  try {
    const downloaded = await downloadTemplate('fixture:local', { ...options, dir: output });
    assert.equal(downloaded.dir, output);
    assert.equal(
      await readFile(join(output, 'fixture.txt'), 'utf8'),
      'expected-template-content\n',
    );
    await assert.rejects(access(join(output, 'outside.txt')));
    console.log('PASS: loopback HTTP tar download and nested subdirectory extraction');
    await assert.rejects(downloadTemplate('fixture:local', { ...options, dir: output }));
    await writeFile(join(output, 'fixture.txt'), 'modified\n');
    await downloadTemplate('fixture:local', { ...options, dir: output, force: true });
    assert.equal(
      await readFile(join(output, 'fixture.txt'), 'utf8'),
      'expected-template-content\n',
    );
    console.log('PASS: nonempty output rejected by default; force overwrites expected file');
    await new Promise((resolve) => server.close(resolve));
    const previousHits = hits;
    await downloadTemplate('fixture:local', {
      ...options,
      dir: join(fixture, 'offline'),
      offline: true,
    });
    assert.equal(
      await readFile(join(fixture, 'offline', 'fixture.txt'), 'utf8'),
      'expected-template-content\n',
    );
    assert.equal(hits, previousHits);
    console.log('PASS: offline cache extraction with HTTP server stopped');
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  const configDir = join(fixture, 'config');
  await mkdir(configDir);
  const configFile = join(configDir, 'trigger.config.ts');
  await writeFile(
    configFile,
    'export default { project: "fixture_project", value: 1 } satisfies { project: string; value: number };\n',
  );
  const loaded = await loadConfig({
    name: 'trigger',
    cwd: configDir,
    configFile: 'trigger.config',
    jitiOptions: { debug: false },
  });
  assert.equal(loaded.config.project, 'fixture_project');
  assert.equal(loaded.config.value, 1);
  console.log('PASS: c12 TypeScript loadConfig with Trigger-equivalent options');
  let observedUpdate;
  let rejectUpdate;
  const changed = new Promise((resolve, reject) => {
    observedUpdate = resolve;
    rejectUpdate = reject;
  });
  const watched = await watchConfig({
    name: 'trigger',
    cwd: configDir,
    configFile: 'trigger.config',
    debounce: 30,
    chokidarOptions: { ignoreInitial: true },
    onUpdate: (update) => {
      if (update.newConfig?.config?.value === 2 || update.config?.value === 2)
        observedUpdate(update);
    },
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await writeFile(configFile, 'export default { project: "fixture_project", value: 2 };\n');
    const timeout = setTimeout(() => rejectUpdate(new Error('c12 watch timeout')), 8000);
    try {
      await changed;
    } finally {
      clearTimeout(timeout);
    }
    console.log('PASS: c12 watchConfig reload after local TypeScript change');
  } finally {
    await watched.unwatch();
  }
  console.log('ALL COMPATIBILITY SMOKES PASSED');
} finally {
  await rm(fixture, { recursive: true, force: true });
}

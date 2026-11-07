import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error(
    'Usage: npm run upgrade:compare -- BEFORE.json AFTER-recovery.json',
  );
  process.exitCode = 2;
} else {
  let server;
  let errorCode = () => 'UPGRADE_AUDIT_FAILED';
  try {
    // Reuse the application's TypeScript verifier. This server has no listener,
    // file watcher or dependency discovery; input files stay on this machine.
    server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      envFile: false,
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const audit = await server.ssrLoadModule(
      '/src/application/storage/upgrade-audit.ts',
    );
    errorCode = audit.upgradeAuditError;
    const [before, after] = await Promise.all(
      paths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
    );
    const report = await audit.auditUpgrade(before, after);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (reason) {
    console.error(JSON.stringify({ passed: false, error: errorCode(reason) }));
    process.exitCode = 1;
  } finally {
    await server?.close();
  }
}

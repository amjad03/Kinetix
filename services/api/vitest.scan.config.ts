import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Static scans and unit tests that need no database (the authorization matrix and the unit specs under src): `vitest run -c vitest.scan.config.ts`. */
export default defineConfig({
  test: { include: ['test/authz-matrix.spec.ts', 'src/**/*.spec.ts'], testTimeout: 120000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

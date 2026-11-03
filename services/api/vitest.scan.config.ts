import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Static scans that need no database (the authorization matrix): `vitest run -c vitest.scan.config.ts`. */
export default defineConfig({
  test: { include: ['test/authz-matrix.spec.ts'], testTimeout: 120000 },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

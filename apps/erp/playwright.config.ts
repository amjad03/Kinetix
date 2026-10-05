import { defineConfig, devices } from '@playwright/test';

// e2e tests run against a live KINETIX Cloud API with the demo seed (see README).
const ERP_URL = process.env.ERP_URL ?? 'http://localhost:3000';
const API_URL = process.env.KINETIX_API_URL ?? 'http://localhost:4000';
const PORT = new URL(ERP_URL).port || '3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: ERP_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'auth', testMatch: /auth\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'dashboard',
      testMatch: /(dashboard|live|syllabus|ai|results|timetable|library-principal|conversations|departments|calendar|terms|settings|kiosk|payments|i18n|import)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/principal.json' },
    },
    // Signs in itself, to check where a head of department lands (and, for plans, as Ravi and the principal).
    // Adds a vice principal and resets their password through the API, then signs in as them.
    { name: 'password', testMatch: /password\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'hod', testMatch: /(department|plans)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'fees',
      testMatch: /fees\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/accountant.json' },
    },
    {
      name: 'library',
      testMatch: /library\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'e2e/.auth/librarian.json' },
    },
  ],
  webServer: process.env.ERP_URL
    ? undefined
    : {
        command: `pnpm exec next dev --port ${PORT}`,
        url: `${ERP_URL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { KINETIX_API_URL: API_URL },
      },
});

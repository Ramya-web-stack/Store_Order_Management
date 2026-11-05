import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://127.0.0.1:5173' }, webServer: [{ command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI }, { command: 'npm --prefix ../backend run dev', url: 'http://localhost:4000/api/health', reuseExistingServer: !process.env.CI }] });

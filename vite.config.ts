import { defineConfig } from 'vite';

export default defineConfig({
  // Local development uses /. GitHub Actions sets /Beat-Orbit/ for Pages.
  base: process.env.VITE_BASE_PATH || '/',
});

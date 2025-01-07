import { defineConfig } from 'vitest/config';
import vitePluginRequire from 'vite-plugin-require';
import { viteRequire } from 'vite-require';

export default defineConfig({
  plugins: [viteRequire({ dynamic: true })],
  test: {
    maxConcurrency: 100,
    // include: ['src/schema/authentication/test/loginMutation.spec.ts'],
    include: ['src/**/*.vitest.ts'],
    server: {
      deps: {},
    },
  },
});

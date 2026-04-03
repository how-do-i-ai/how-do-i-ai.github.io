import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://how-do-i.ai',
  output: 'static',
  build: {
    format: 'directory',
  },
});

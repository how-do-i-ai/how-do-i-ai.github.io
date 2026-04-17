import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  {
    ignores: ['dist/', '.astro/', '.tmp/', '.claude/', 'node_modules/'],
  },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
);

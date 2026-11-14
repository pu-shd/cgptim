import { defineConfig } from 'vite';

const base = process.env.VITE_BASE_PATH ?? './';
if (base !== './' && !/^\/[a-zA-Z0-9_/-]*\/$/.test(base)) {
  throw new Error('VITE_BASE_PATH must be ./ or an absolute directory path ending in /.');
}
export default defineConfig({
  base,
  build: { target: 'es2022' },
  plugins: [
    {
      name: 'development-style-csp',
      apply: 'serve',
      transformIndexHtml: (html) =>
        html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
    },
  ],
});

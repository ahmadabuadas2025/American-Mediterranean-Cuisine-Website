// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Netlify exposes the primary site URL as URL during builds.
const site = process.env.URL || process.env.SITE_URL || 'https://american-mediterranean-cuisine.netlify.app';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    sitemap({
      filter: (page) => !/\/(admin|thanks|404|order\/(success|cancel))\b/.test(page),
    }),
  ],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()] },
});

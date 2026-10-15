import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { faqSchema, menuItemSchema, packageSchema, pageSchema } from './lib/schemas';

export const collections = {
  menu: defineCollection({ loader: glob({ pattern: '*.json', base: './src/content/menu' }), schema: menuItemSchema }),
  packages: defineCollection({ loader: glob({ pattern: '*.json', base: './src/content/packages' }), schema: packageSchema }),
  faq: defineCollection({ loader: glob({ pattern: '*.json', base: './src/content/faq' }), schema: faqSchema }),
  pages: defineCollection({ loader: glob({ pattern: '*.md', base: './src/content/pages' }), schema: pageSchema }),
};

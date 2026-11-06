import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const apiDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(apiDirectory, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

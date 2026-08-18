import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Database URL for migrations (runtime uses adapter pattern)
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

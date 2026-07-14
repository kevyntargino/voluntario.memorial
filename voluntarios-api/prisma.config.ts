import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Apontamos exclusivamente para a DIRECT_URL do seu .env
    // Isso garante que o Prisma CLI use a porta 5432 exigida pelo Supabase
    url: process.env.DIRECT_URL,
  },
});
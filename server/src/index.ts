import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:5173' }))
  .get('/api/health', () => ({ status: 'ok' }))
  .listen(3000);

console.log(`Proxy server running at http://localhost:${app.server?.port}`);

export type App = typeof app;

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Runs the /api/*.ts functions inside the dev server, so `npm run dev` works
 * like Vercel does in production. Server-only env vars (GROQ_API_KEY) stay on the server.
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/([a-z]+)(?:\?|$)/)?.[1];
        const file = name && resolve(server.config.root, 'api', `${name}.ts`);
        if (!file || !existsSync(file)) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const mod = await server.ssrLoadModule(file);
          const response: Response = await mod.default(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          if (response.body) {
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value); // stream chunks as they arrive
            }
          }
          res.end();
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          console.error(e);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Local API crashed: ' + (e as Error).message }));
        }
      });
    },
  };
}

/** The same security headers Vercel sends (from vercel.json), for testing with `vite preview`. */
function vercelHeaders(): Record<string, string> {
  const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    headers?: { headers: { key: string; value: string }[] }[];
  };
  return Object.fromEntries((cfg.headers ?? []).flatMap((h) => h.headers.map((x) => [x.key, x.value])));
}

export default defineConfig(({ mode }) => {
  // Make .env values (incl. server-only GROQ_API_KEY) visible to the local API functions.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  return {
    plugins: [react(), tailwindcss(), localApi()],
    preview: { headers: vercelHeaders() },
  };
});

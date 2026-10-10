import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Runtime } from './runtime.ts';

export async function startServer(runtime: Runtime) {
  const token = randomBytes(32).toString('hex');
  const clients = new Set<http.ServerResponse>();
  let origin = '';
  let serial: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = serial.then(fn, fn); serial = next.catch(() => {}); return next;
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (value: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      if (`http://${req.headers.host}` !== origin) { json({ error: 'Invalid host' }, 403); return; }
      if (req.headers.origin && req.headers.origin !== origin) { json({ error: 'Invalid origin' }, 403); return; }
      if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))) { json({ error: 'Cross-site requests are not allowed' }, 403); return; }
      const url = new URL(req.url || '/', origin);
      if (req.method === 'GET') {
        if (url.pathname === '/api/session') { json({ token }); return; }
        if (url.pathname === '/api/jobs') { json(await runtime.store.list()); return; }
        if (url.pathname.startsWith('/api/jobs/')) { json(await runtime.store.detail(await runtime.store.resolve(decodeURIComponent(url.pathname.slice(10))))); return; }
        if (url.pathname === '/api/artifact') {
          const body = await runtime.store.artifact(await runtime.store.resolve(url.searchParams.get('id') || ''), url.searchParams.get('path') || '');
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(body); return;
        }
        if (url.pathname === '/api/events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
          res.write('event: change\ndata: connected\n\n'); clients.add(res);
          req.on('close', () => clients.delete(res)); return;
        }
        const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        const file = files[url.pathname];
        if (file) { res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(await fs.readFile(path.join(import.meta.dirname, 'public', file[0]))); return; }
      }
      if (req.method === 'POST' && ['/api/action', '/api/command'].includes(url.pathname)) {
        if (req.headers['x-factory-token'] !== token) { json({ error: 'Invalid action token' }, 403); return; }
        if (!String(req.headers['content-type']).startsWith('application/json')) { json({ error: 'JSON required' }, 415); return; }
        let body = ''; for await (const chunk of req) { body += chunk.toString(); if (body.length > 128_000) throw new Error('Request too large'); }
        const args = JSON.parse(body);
        if (url.pathname === '/api/action' && !['pause', 'resume', 'cancel', 'answer'].includes(args.action)) throw new Error('Dashboard action not allowed');
        const result = await queued(() => runtime.command(args));
        json(url.pathname === '/api/action' ? { ok: true } : result); return;
      }
      json({ error: 'Not found' }, 404);
    } catch (error) { if (!res.headersSent) json({ error: error instanceof Error ? error.message : String(error) }, 400); else res.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind local server');
  origin = `http://127.0.0.1:${address.port}`;
  runtime.onChange = () => { for (const client of clients) client.write('event: change\ndata: updated\n\n'); };
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15_000);
  const timer = setInterval(() => { void queued(() => runtime.tick()).catch(error => console.error('Factory tick:', error)); }, 1000);
  return { url: origin, token, server,
    close: async () => { clearInterval(timer); clearInterval(heartbeat); for (const client of clients) client.end(); await queued(() => runtime.shutdown()); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

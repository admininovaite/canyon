import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8026);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function readRequestBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleSaveSquads(req, res) {
  try {
    const body = await readRequestBody(req);
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || !parsed.images || !parsed.positions) {
      send(res, 400, JSON.stringify({ ok: false, error: 'Invalid squads payload' }), {
        'Content-Type': 'application/json',
      });
      return;
    }
    await fs.writeFile(path.join(ROOT, 'squads.json'), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    send(res, 200, JSON.stringify({ ok: true, file: 'squads.json' }), {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    send(res, 500, JSON.stringify({ ok: false, error: err.message }), {
      'Content-Type': 'application/json',
    });
  }
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.join(ROOT, path.normalize(requested).replace(/^[/\\]+/, ''));

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    send(res, 200, data, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__save-squads') {
    handleSaveSquads(req, res);
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    handleStatic(req, res);
    return;
  }
  send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Canyon Clash admin server: http://127.0.0.1:${PORT}/index.html?admin`);
  console.log('Uploads and position edits can save directly to squads.json from this server.');
});

import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const certFile = resolve(root, 'certs/voxera.pem');
const keyFile = resolve(root, 'certs/voxera-key.pem');
const port = Number(process.env.PORT || 4173);
const secure = existsSync(certFile) && existsSync(keyFile);
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml' };

const handler = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // Mock API routes for the offline demo
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    
    if (pathname === '/api/auth/login') {
      res.writeHead(200);
      return res.end(JSON.stringify({
        token: 'demo-token-123',
        user: { id: 1, name: 'Efeoluwa', role: 'organiser', language: 'English', area: 'Lagos' }
      }));
    }
    if (pathname === '/api/programmes') {
      res.writeHead(200);
      return res.end(JSON.stringify([
        { id: 1, title: 'Digital Skills for Work', category: 'Skills & employment', format: 'Online', location: 'Lagos · Online', start_date: '12 Oct', end_date: '23 Nov 2026', capacity: 20, enrolled_count: 12, status: 'open', description: 'Build practical digital skills.' },
        { id: 2, title: 'Community Health Champions', category: 'Health & wellbeing', format: 'Physical', location: 'Ikeja, Lagos', start_date: '16 Oct', end_date: '20 Nov 2026', capacity: 15, enrolled_count: 11, status: 'open', description: 'Learn essential health practices.' },
        { id: 3, title: 'Small Business Ready', category: 'Enterprise', format: 'Hybrid', location: 'Yaba, Lagos', start_date: '28 Sep', end_date: '02 Nov 2026', capacity: 10, enrolled_count: 10, status: 'full', description: 'Make your business more resilient.' }
      ]));
    }
    if (pathname === '/api/participants' || pathname === '/api/enrolments' || pathname === '/api/cases' || pathname === '/api/conversations' || pathname === '/api/certificates') {
      res.writeHead(200);
      return res.end(JSON.stringify([]));
    }
    if (pathname === '/api/profile') {
      res.writeHead(200);
      return res.end(JSON.stringify({ name: 'Efeoluwa', role: 'organiser', language: 'English', area: 'Lagos' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ success: true }));
  }

  // Static file serving
  let target = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!existsSync(target)) {
    target = resolve(root, 'index.html');
  }
  
  res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(target));
};

const server = secure ? createSecureServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, handler) : createServer(handler);
server.listen(port, '0.0.0.0', () => {
  const protocol = secure ? 'https' : 'http';
  console.log(`Voxera is ready at ${protocol}://localhost:${port}`);
  if (!secure) console.log('Local-network microphone access needs mkcert certificates; see README.md.');
});
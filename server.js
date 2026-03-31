const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/tour-api/')) {
    const target = 'https://apis.data.go.kr' + req.url.replace('/tour-api', '');
    https.get(target, (proxy) => {
      res.writeHead(proxy.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      proxy.pipe(res);
    }).on('error', (e) => {
      console.error('TourAPI 에러:', e.message);
      res.writeHead(500);
      res.end('{}');
    });
    return;
  }

  if (req.url.startsWith('/odsay/')) {
    const target = 'https://api.odsay.com' + req.url.replace('/odsay', '');
    https.get(target, (proxy) => {
      res.writeHead(proxy.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      proxy.pipe(res);
    }).on('error', (e) => {
      console.error('ODsay 에러:', e.message);
      res.writeHead(500);
      res.end('{}');
    });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  서버 실행 중: http://localhost:${PORT}\n`);
});

'use strict';

// Dev server for the visual editor. Serves the app, the repo tree (faces,
// resources), and a tiny API for loading/saving design.json + running codegen.
// Usage: node tools/pebble-editor/serve.js [root] [port]
// Root defaults to the current working directory (run from the face repo).

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const PORT = parseInt(process.argv[3] || '8137', 10);
const TOOLS = path.join(ROOT, 'tools', 'pebble-editor');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.svg': 'image/svg+xml',
};

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root + path.sep) && p !== root) return null;
  return p;
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain' });
  res.end(body);
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function rootedPath(rel) {
  if (!rel) return null;
  // Absolute paths are allowed only inside the root; anything else must be
  // repo-relative. safeJoin contains the relative case.
  if (path.isAbsolute(rel)) {
    const p = path.normalize(rel);
    if (!p.startsWith(ROOT + path.sep) && p !== ROOT) return null;
    return p;
  }
  return safeJoin(ROOT, rel);
}

function designPath(url) {
  const rel = url.searchParams.get('path') || '';
  if (!rel.endsWith('.design.json') && !rel.endsWith('.resources.json')) return null;
  return rootedPath(rel);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/app/' });
      return res.end();
    }
    if (url.pathname === '/app/' || url.pathname === '/app') {
      return serveFile(res, path.join(TOOLS, 'app', 'index.html'));
    }
    if (url.pathname.startsWith('/app/')) {
      const f = safeJoin(path.join(TOOLS, 'app'), url.pathname.slice(5));
      if (!f) return send(res, 403, 'forbidden');
      return serveFile(res, f);
    }
    if (url.pathname === '/api/design' && req.method === 'GET') {
      const f = designPath(url);
      if (!f) return send(res, 400, JSON.stringify({ error: 'bad path' }), 'application/json');
      fs.readFile(f, 'utf8', (err, data) => {
        if (err) return send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
        try {
          send(res, 200, JSON.stringify({ design: JSON.parse(data) }), 'application/json');
        } catch (e) {
          send(res, 500, JSON.stringify({ error: 'invalid JSON: ' + e.message }), 'application/json');
        }
      });
      return;
    }
    if (url.pathname === '/api/design' && req.method === 'PUT') {
      const f = designPath(url);
      if (!f) return send(res, 400, JSON.stringify({ error: 'bad path' }), 'application/json');
      const body = await readBody(req);
      let design;
      try {
        design = JSON.parse(body).design;
        if (!design) throw new Error('missing design');
      } catch (e) {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON: ' + e.message }), 'application/json');
      }
      if (f.endsWith('.design.json')) {
        const { validateDesign } = require('./validate');
        const errors = validateDesign(design);
        if (errors.length) {
          return send(res, 400, JSON.stringify({
            error: 'invalid design: ' + errors.map(e => e.path + ': ' + e.message).join('; ')
          }), 'application/json');
        }
      }
      fs.writeFile(f, JSON.stringify(design, null, 2) + '\n', (err) => {
        if (err) return send(res, 500, JSON.stringify({ error: String(err) }), 'application/json');
        send(res, 200, JSON.stringify({ ok: true }), 'application/json');
      });
      return;
    }
    if (url.pathname === '/api/generate' && req.method === 'POST') {
      const body = await readBody(req);
      let args;
      try {
        args = JSON.parse(body);
      } catch (e) {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON' }), 'application/json');
      }
      const designFile = rootedPath(args.design || '');
      const outDir = rootedPath(args.outDir || '');
      if (!designFile || !outDir) {
        return send(res, 400, JSON.stringify({ error: 'bad paths' }), 'application/json');
      }
      execFile(process.execPath, [path.join(TOOLS, 'generate.js'), designFile, '--out-dir', outDir],
        (err, stdout, stderr) => {
          if (err) {
            return send(res, 500, JSON.stringify({ error: (stdout + stderr).slice(0, 2000) }), 'application/json');
          }
          send(res, 200, JSON.stringify({ ok: true, output: stdout }), 'application/json');
        });
      return;
    }
    const f = safeJoin(ROOT, decodeURIComponent(url.pathname));
    if (!f) return send(res, 403, 'forbidden');
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'not found');
      serveFile(res, f);
    });
  } catch (e) {
    send(res, 500, String(e && e.message || e));
  }
});

server.listen(PORT, () => {
  console.log('pebble editor at http://localhost:' + PORT + '/app/?face=tools/pebble-editor/examples/neubrutalism-plus.design.json');
});

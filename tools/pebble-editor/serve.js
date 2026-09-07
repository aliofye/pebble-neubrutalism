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
// React shell (ui/) builds to app-dist; fall back to the legacy vanilla
// shell when no build is present.
const DIST = path.join(TOOLS, 'app-dist');
const APP_DIR = fs.existsSync(path.join(DIST, 'index.html')) ? DIST : path.join(TOOLS, 'app');

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
    // Never cache the editor app or designs: the files change on every
    // save/regenerate and stale JS shows yesterday's default face.
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
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
      return serveFile(res, path.join(APP_DIR, 'index.html'));
    }
    if (url.pathname.startsWith('/app/')) {
      const f = safeJoin(APP_DIR, url.pathname.slice(5));
      if (!f) return send(res, 403, 'forbidden');
      return serveFile(res, f);
    }
    if (url.pathname === '/app-legacy/' || url.pathname === '/app-legacy') {
      return serveFile(res, path.join(TOOLS, 'app', 'index.html'));
    }
    if (url.pathname.startsWith('/app-legacy/')) {
      const f = safeJoin(path.join(TOOLS, 'app'), url.pathname.slice(12));
      if (!f) return send(res, 403, 'forbidden');
      return serveFile(res, f);
    }
    if (url.pathname === '/api/design' && req.method === 'GET') {
      const f = designPath(url);
      if (!f) return send(res, 400, JSON.stringify({ error: 'bad path' }), 'application/json');
      fs.readFile(f, 'utf8', (err, data) => {
        if (err) return send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
        try {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ design: JSON.parse(data) }));
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
    if (url.pathname === '/api/widgets' && req.method === 'GET') {
      const dir = path.join(TOOLS, 'widgets');
      let names = [];
      try {
        names = fs.readdirSync(dir).filter(n =>
          fs.statSync(path.join(dir, n)).isDirectory() &&
          fs.existsSync(path.join(dir, n, 'widget.json')));
      } catch (e) {
        return send(res, 500, JSON.stringify({ error: 'no widget registry' }), 'application/json');
      }
      const widgets = {};
      for (const n of names) {
        try {
          widgets[n] = JSON.parse(fs.readFileSync(path.join(dir, n, 'widget.json'), 'utf8'));
        } catch (e) {
          return send(res, 500, JSON.stringify({ error: 'bad manifest: ' + n }), 'application/json');
        }
      }
      send(res, 200, JSON.stringify({ widgets }), 'application/json');
      return;
    }
    if (url.pathname === '/api/face' && req.method === 'POST') {
      const body = await readBody(req);
      let args;
      try {
        args = JSON.parse(body);
      } catch (e) {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON' }), 'application/json');
      }
      const slugOk = (s) => typeof s === 'string' && /^[a-zA-Z0-9_.-]+\.design\.json$/.test(s.split('/').pop());
      if (args.action === 'duplicate') {
        if (!slugOk(args.src) || !slugOk(args.dst)) {
          return send(res, 400, JSON.stringify({ error: 'src/dst must be .design.json paths' }), 'application/json');
        }
        const src = rootedPath(args.src), dst = rootedPath(args.dst);
        if (!src || !dst) return send(res, 400, JSON.stringify({ error: 'bad paths' }), 'application/json');
        if (src === dst) return send(res, 400, JSON.stringify({ error: 'src == dst' }), 'application/json');
        fs.readFile(src, 'utf8', (err, data) => {
          if (err) return send(res, 404, JSON.stringify({ error: 'src not found' }), 'application/json');
          try { JSON.parse(data); } catch (e) {
            return send(res, 400, JSON.stringify({ error: 'src invalid JSON' }), 'application/json');
          }
          fs.writeFile(dst, data, (werr) => {
            if (werr) return send(res, 500, JSON.stringify({ error: String(werr) }), 'application/json');
            // Copy sibling resources map when present (fonts/bitmaps preview).
            const srcRes = src.replace(/\.design\.json$/, '.resources.json');
            const dstRes = dst.replace(/\.design\.json$/, '.resources.json');
            fs.readFile(srcRes, 'utf8', (rerr, rdata) => {
              if (rerr) return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
              fs.writeFile(dstRes, rdata, () => send(res, 200, JSON.stringify({ ok: true }), 'application/json'));
            });
          });
        });
        return;
      }
      if (args.action === 'new') {
        if (!slugOk(args.dst)) {
          return send(res, 400, JSON.stringify({ error: 'dst must be a .design.json path' }), 'application/json');
        }
        const dst = rootedPath(args.dst);
        if (!dst) return send(res, 400, JSON.stringify({ error: 'bad dst' }), 'application/json');
        if (fs.existsSync(dst)) return send(res, 400, JSON.stringify({ error: 'dst exists' }), 'application/json');
        const template = args.template === 'starter' ? 'starter.design.json' : 'blank.design.json';
        const tpl = path.join(TOOLS, 'examples', template);
        let data;
        try {
          data = JSON.parse(fs.readFileSync(tpl, 'utf8'));
        } catch (e) {
          return send(res, 500, JSON.stringify({ error: 'bad template' }), 'application/json');
        }
        const { randomUUID } = require('crypto');
        data.name = String(args.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
        data.app = data.app || {};
        data.app.displayName = String(args.name || 'Untitled');
        data.app.uuid = randomUUID().toUpperCase();
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFile(dst, JSON.stringify(data, null, 2) + '\n', (werr) => {
          if (werr) return send(res, 500, JSON.stringify({ error: String(werr) }), 'application/json');
          const tplRes = tpl.replace(/\.design\.json$/, '.resources.json');
          const dstRes = dst.replace(/\.design\.json$/, '.resources.json');
          if (fs.existsSync(tplRes)) {
            try { fs.copyFileSync(dstRes && tplRes, dstRes); } catch (e) { /* preview map optional */ }
          }
          send(res, 200, JSON.stringify({ ok: true }), 'application/json');
        });
        return;
      }
      return send(res, 400, JSON.stringify({ error: 'unknown action' }), 'application/json');
    }
    if (url.pathname === '/api/font' && req.method === 'POST') {
      const body = await readBody(req);
      let args;
      try {
        args = JSON.parse(body);
      } catch (e) {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON' }), 'application/json');
      }
      const fontId = String(args.fontId || '');
      const resource = String(args.resource || '');
      if (!/^[a-z][a-z0-9_]*$/.test(fontId)) {
        return send(res, 400, JSON.stringify({ error: 'fontId must match ^[a-z][a-z0-9_]*$' }), 'application/json');
      }
      if (!/^FONT_[A-Z0-9_]+_\d+$/.test(resource)) {
        return send(res, 400, JSON.stringify({ error: 'resource must look like FONT_<NAME>_<SIZE>' }), 'application/json');
      }
      let buf;
      try {
        buf = Buffer.from(String(args.b64 || ''), 'base64');
      } catch (e) {
        return send(res, 400, JSON.stringify({ error: 'bad b64' }), 'application/json');
      }
      if (buf.length < 12 || buf.length > 400 * 1024) {
        return send(res, 400, JSON.stringify({ error: 'TTF size out of range (12B–400KB)' }), 'application/json');
      }
      const magic = buf.readUInt32BE(0);
      const tag = buf.slice(0, 4).toString('ascii');
      if (magic !== 0x00010000 && tag !== 'true' && tag !== 'OTTO') {
        return send(res, 400, JSON.stringify({ error: 'not a TTF/OTF font' }), 'application/json');
      }
      const designFile = rootedPath(args.design || '');
      if (!designFile || !designFile.endsWith('.design.json')) {
        return send(res, 400, JSON.stringify({ error: 'bad design path' }), 'application/json');
      }
      let design;
      try {
        design = JSON.parse(fs.readFileSync(designFile, 'utf8'));
      } catch (e) {
        return send(res, 404, JSON.stringify({ error: 'design not found' }), 'application/json');
      }
      if ((design.fonts || []).some(f => f.id === fontId || f.resource === resource)) {
        return send(res, 400, JSON.stringify({ error: 'font id/resource already exists' }), 'application/json');
      }
      const size = parseInt(resource.match(/_(\d+)$/)[1], 10);
      if (!(size >= 8 && size <= 64)) {
        return send(res, 400, JSON.stringify({ error: 'font size must be 8–64' }), 'application/json');
      }
      const fileName = resource + '.ttf';
      const resDir = path.join(ROOT, 'resources', 'fonts');
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(path.join(resDir, fileName), buf);
      design.fonts = design.fonts || [];
      design.fonts.push({ id: fontId, resource });
      const { validateDesign } = require('./validate');
      const errors = validateDesign(design);
      if (errors.length) {
        fs.unlinkSync(path.join(resDir, fileName));
        return send(res, 400, JSON.stringify({
          error: 'invalid design: ' + errors.map(e => e.path + ': ' + e.message).join('; ')
        }), 'application/json');
      }
      fs.writeFileSync(designFile, JSON.stringify(design, null, 2) + '\n');
      const resMapFile = designFile.replace(/\.design\.json$/, '.resources.json');
      let resMap = {};
      try { resMap = JSON.parse(fs.readFileSync(resMapFile, 'utf8')); } catch (e) { resMap = {}; }
      resMap[resource] = '/resources/fonts/' + fileName;
      fs.writeFileSync(resMapFile, JSON.stringify(resMap, null, 2) + '\n');
      send(res, 200, JSON.stringify({ ok: true, file: 'resources/fonts/' + fileName }), 'application/json');
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
  console.log('pebble editor at http://localhost:' + PORT + '/app/?face=tools/pebble-editor/examples/blank.design.json');
});

// Thin client for the editor dev server (../serve.js). Same endpoints the
// legacy shell used, plus /api/face and /api/font.

async function call(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

export const api = {
  loadDesign(facePath) {
    return call('/api/design?path=' + encodeURIComponent(facePath));
  },
  saveDesign(facePath, design) {
    return call('/api/design?path=' + encodeURIComponent(facePath), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design }),
    });
  },
  widgets() {
    return call('/api/widgets');
  },
  generate(designPath, outDir) {
    return call('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design: designPath, outDir }),
    });
  },
  duplicateFace(src, dst) {
    return call('/api/face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'duplicate', src, dst }),
    });
  },
  newFace(dst, name, template) {
    return call('/api/face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'new', dst, name, template }),
    });
  },
  uploadFont(designPath, fontId, resource, b64) {
    return call('/api/font', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design: designPath, fontId, resource, b64 }),
    });
  },
};

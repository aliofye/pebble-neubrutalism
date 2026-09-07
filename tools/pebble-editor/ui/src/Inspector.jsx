import React, { useState } from 'react';
import { Trash2, Users, Lock } from 'lucide-react';
import MODEL from './gen/engine.js';
import PV from './gen/preview.js';
import { api } from './api.js';

// Right panel: inspector for the current selection.
export default function Inspector(props) {
  const { S, design, manifests, providerOf, sel, setSel } = props;
  const { mutate, toast, deleteSelection, groupSelection, setFonts, refresh, seedSimVar } = props;

  if (!design) return <div className="hint">loading…</div>;
  const sid = S.activeScreen && design.screens[S.activeScreen]
    ? S.activeScreen : Object.keys(design.screens)[0];
  const mySel = sel.filter(s => s.screen === undefined || s.screen === sid);

  if (!mySel.length) {
    return (
      <div className="insp">
        <div className="sec">Inspector</div>
        <div className="hint">
          Click a target to inspect it. Shift+click adds to the selection.
          <br /><br />
          <b>R</b> rect · <b>B</b> bar · <b>T</b> text · <b>P</b> polygon · <b>V</b> move · <b>Del</b> delete.
          New shapes mirror to the other size automatically.
        </div>
      </div>
    );
  }

  if (mySel.length > 1) {
    return (
      <div className="insp">
        <div className="sec">Inspector</div>
        <h3>{mySel.length} selected</h3>
        <div className="rowbtns">
          <button className="btn primary" onClick={groupSelection}><Users size={14} /> Group</button>
          <button className="btn danger" onClick={deleteSelection}><Trash2 size={14} /> Delete</button>
        </div>
        <div className="hint">Move with the mouse or arrow keys. Group names and locks the set on both sizes.</div>
      </div>
    );
  }

  const s = mySel[0];
  if (s.group) {
    const g = design.screens[sid].groups?.find(g => g.id === s.group);
    if (!g) return <div className="hint">group gone — click the canvas</div>;
    return (
      <div className="insp">
        <div className="sec">Group</div>
        <h3>{g.label || g.id}</h3>
        <div className="hint">{g.members.length} members · {g.locked ? 'locked' : 'unlocked'}</div>
        <div className="rowbtns">
          <button className="btn" onClick={() => mutate(doc => {
            MODEL.setGroupLock(doc, sid, g.id, !g.locked);
          }, g.locked ? 'unlocked' : 'locked')}>
            <Lock size={14} /> {g.locked ? 'Unlock' : 'Lock'}
          </button>
          <button className="btn" onClick={() => {
            mutate(doc => { MODEL.deleteGroup(doc, sid, g.id); }, 'ungrouped');
            setSel([]);
          }}>Ungroup</button>
        </div>
      </div>
    );
  }

  const sc = design.screens[sid];
  const layer = sc.layers[s.layer];
  if (!layer) return <div className="hint">stale selection</div>;
  const isItem = s.item !== null && s.item !== undefined;
  const target = isItem ? layer.items[s.item] : layer;
  if (!target) return <div className="hint">stale selection</div>;

  let bounds = null;
  try {
    bounds = MODEL.itemBounds(design, sid, s.layer, isItem ? s.item : null);
  } catch (e) { /* unevaluable dims */ }

  const setBox = (k, v) => {
    mutate(doc => {
      const t = isItem
        ? doc.screens[sid].layers[s.layer].items[s.item]
        : doc.screens[sid].layers[s.layer];
      if (t.box) t.box[k] = v;
    });
  };

  // Mirror-safe writer. Applies fn to this target AND its mirrored
  // counterpart on the sibling size (matched by layer id + item index +
  // kind). Used for bindings, fills, fonts and visibility — anything where
  // per-screen divergence breaks validation or looks like a bug. Geometry
  // (box, points) stays per-screen.
  const updateBoth = (fn) => mutate(doc => {
    const layerId = sc.layers[s.layer].id;
    const applyTo = (screenId, li, ii) => {
      const l = doc.screens[screenId].layers[li];
      const t = isItem ? l.items[ii] : l;
      if (!t) return false;
      if (isItem && t.kind !== target.kind) return false;
      if (!isItem && l.kind !== layer.kind) return false;
      fn(t);
      return true;
    };
    applyTo(sid, s.layer, s.item);
    const sib = MODEL.siblingScreenId(doc, sid);
    if (sib) {
      const di = doc.screens[sib].layers.findIndex(l => l.id === layerId);
      if (di >= 0) applyTo(sib, di, s.item);
    }
  });

  // Connect a $ref to its provider: mirror the binding, auto-add the
  // widget + state var, and seed the simulator so the binding previews
  // with a sane live default immediately.
  const connectBinding = (ref, type, apply) => {
    const name = MODEL.bindingOf(ref);
    updateBoth(t => {
      apply(t, ref);
      const doc = S.design;
      const all = MODEL.listProviders(manifests, doc.settings);
      const pick = [...all[type]].find(p => p.name === name);
      if (pick && pick.widget && MODEL.ensureWidget(doc, pick.widget)) {
        MODEL.ensureStateVar(doc, pick.name, type);
        toast('connected ' + pick.widget + ' widget');
      }
    });
    if (name) seedSimVar(name, type);
  };

  return (
    <div className="insp">
      <div className="sec">Inspector</div>
      <h3>{layer.id}{isItem ? ' / ' + target.kind + ' ' + s.item : ''}</h3>
      {bounds && (
        <div className="hint" style={{ fontFamily: 'var(--mono)' }}>
          {target.kind || layer.kind} · x{bounds.x} y{bounds.y} w{bounds.w} h{bounds.h}px
        </div>
      )}

      {target.box && (
        <>
          <label>Position</label>
          <div className="grid2">
            {['x', 'y', 'w', 'h'].map(k => (
              <div className="numrow" key={k}>
                <span>{k}</span>
                <input
                  type="text" value={String(target.box[k])}
                  onChange={e => {
                    const raw = e.target.value.trim();
                    const n = Number(raw);
                    setBox(k, raw !== '' && !isNaN(n) ? n : raw);
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <FillEditor design={design} themeIdx={S.themeIdx} fill={target.fill} updateBoth={updateBoth} label={target.kind === 'bar' ? 'Fill (bar)' : 'Fill'} fillKey="fill" />

      {target.kind === 'bar' && (
        <FillEditor design={design} themeIdx={S.themeIdx} fill={target.track} updateBoth={updateBoth} label="Track" fillKey="track" />
      )}

      {target.kind === 'polygon' && (
        <div className="hint">{target.points.length} vertices — double-click the shape to drag them.</div>
      )}

      {(layer.kind === 'text' || layer.kind === 'pixeltext') && !isItem && (
        <FontPicker S={S} design={design} layer={layer} mutate={mutate} setFonts={setFonts} refresh={refresh} toast={toast} />
      )}

      {(layer.kind === 'pixeltext' || layer.pixelFont) && !isItem && (
        <NumField label="Pixel scale (screen ÷ n)" get={() => layer.scaleDivisor || 40} set={(v) => mutate(doc => {
          const sid = S.activeScreen;
          const li = doc.screens[sid].layers.findIndex(l => l.id === layer.id);
          if (li >= 0) doc.screens[sid].layers[li].scaleDivisor = Math.max(1, Math.round(v) || 40);
        })} />
      )}

      {((layer.kind === 'text' || layer.kind === 'pixeltext') && !isItem && typeof layer.text === 'string') && (
        <ProviderPicker S={S} design={design} manifests={manifests} type="string" label="Data"
          get={() => layer.text}
          set={(v) => connectBinding(v, 'string', (t, ref) => { t.text = ref; })} />
      )}

      {target.kind === 'meterbar' && typeof target.value === 'string' && (
        <ProviderPicker S={S} design={design} manifests={manifests} type="int" label="Value"
          get={() => target.value}
          set={(v) => connectBinding(v, 'int', (t, ref) => { t.value = ref; })} />
      )}

      {target.kind === 'bar' && typeof target.value === 'string' && (
        <ProviderPicker S={S} design={design} manifests={manifests} type="int" label="Value"
          get={() => target.value}
          set={(v) => connectBinding(v, 'int', (t, ref) => { t.value = ref; })} />
      )}

      <VisibilityEditor target={target} layer={layer} updateBoth={updateBoth} />

      <div className="rowbtns">
        <button className="btn danger" onClick={deleteSelection}><Trash2 size={14} /> Delete</button>
      </div>
    </div>
  );
}

function FillEditor({ design, themeIdx, fill, updateBoth, label, fillKey }) {
  const theme = design.themes[themeIdx] || design.themes[0];
  if (fill === undefined) return null;

  const tokens = Object.keys(theme.tokens || {});
  const hexOf = (ref) => {
    try {
      if (typeof ref === 'string') {
        if (ref.startsWith('$')) {
          const tok = theme.tokens[ref.slice(1)];
          return tok ? PV.GCOLORS[tok.slice(6)] || '#000' : null;
        }
        return PV.GCOLORS[ref.slice(6)] || null;
      }
    } catch (e) { return null; }
    return null;
  };

  const set = (v) => updateBoth(t => { t[fillKey] = v; });

  if (typeof fill === 'string') {
    const palette = Object.entries(PV.GCOLORS || {}).filter(([, hex]) => typeof hex === 'string');
    return (
      <>
        <label>{label}</label>
        <div className="hint" style={{ margin: '2px 0 4px' }}>
          theme tokens ($ink…) follow the active theme — switch it in Simulate to preview. pebble colors are fixed.
        </div>
        <div className="swatches">
          {tokens.map(t => (
            <button
              key={t}
              className={'sw' + (fill === '$' + t ? ' sel' : '')}
              title={'$' + t}
              style={{ background: hexOf('$' + t) || '#333' }}
              onClick={() => set('$' + t)}
            />
          ))}
        </div>
        <div className="hint" style={{ margin: '8px 0 4px' }}>pebble colors</div>
        <div className="swatches">
          {palette.map(([name, hex]) => (
            <button
              key={name}
              className={'sw pal' + (fill === 'GColor' + name ? ' sel' : '')}
              title={'GColor' + name}
              style={{ background: hex }}
              onClick={() => set('GColor' + name)}
            />
          ))}
          <button
            className={'sw pal clear' + (fill === 'GColorClear' ? ' sel' : '')}
            title="GColorClear (transparent)"
            onClick={() => set('GColorClear')}
          />
        </div>
        <input
          type="text" value={fill} style={{ marginTop: 6, fontFamily: 'var(--mono)' }}
          onChange={e => set(e.target.value.trim())}
          title="GColor literal or $token"
        />
      </>
    );
  }
  return (
    <>
      <label>{label} (conditional)</label>
      <textarea
        className="mono" rows={6} defaultValue={JSON.stringify(fill, null, 1)}
        onBlur={e => {
          try {
            set(JSON.parse(e.target.value));
          } catch (err) { /* keep old on bad JSON */ }
        }}
      />
    </>
  );
}

function NumField({ label, get, set }) {
  return (
    <>
      <label>{label}</label>
      <div className="numrow">
        <input type="text" value={String(get())} onChange={e => {
          const n = Number(e.target.value.trim());
          if (!isNaN(n)) set(n);
        }} />
      </div>
    </>
  );
}

function FontPicker({ S, design, layer, mutate, setFonts, refresh, toast }) {
  const [upload, setUpload] = useState(null);
  const pixelIds = Object.keys(design.pixelFonts || {});
  const value = layer.pixelFont ? 'pixel:' + layer.pixelFont : 'font:' + layer.font;
  const convert = (v) => {
    if (v.startsWith('pixel:')) {
      const id = v.slice(6);
      mutate(doc => {
        const sid = S.activeScreen;
        const li = doc.screens[sid].layers.findIndex(l => l.id === layer.id);
        if (li < 0) return;
        const sib = MODEL.siblingScreenId(doc, sid);
        for (const [s2, l2] of [[sid, li], ...(sib ? [[sib, doc.screens[sib].layers.findIndex(l => l.id === layer.id)]] : [])]) {
          if (l2 < 0) continue;
          const u = doc.screens[s2].layers[l2];
          u.pixelFont = id;
          delete u.font;
          if (!u.scaleDivisor) u.scaleDivisor = 40;
        }
      });
      toast('pixel font: ' + id);
      return;
    }
    const vid = v.slice(5);
    mutate(doc => {
      const sid = S.activeScreen;
      const li = doc.screens[sid].layers.findIndex(l => l.id === layer.id);
      if (li < 0) return;
      const sib = MODEL.siblingScreenId(doc, sid);
      for (const [s2, l2] of [[sid, li], ...(sib ? [[sib, doc.screens[sib].layers.findIndex(l => l.id === layer.id)]] : [])]) {
        if (l2 < 0) continue;
        const u = doc.screens[s2].layers[l2];
        u.font = vid;
        delete u.pixelFont;
      }
    });
    // Reload the font file for preview.
    const f = (design.fonts || []).find(f => f.id === vid);
    const url = f && S.resMap[f.resource];
    if (url) {
      const family = 'PE_' + vid;
      const face = new FontFace(family, 'url(' + url + ')');
      face.load().then(() => {
        document.fonts.add(face);
        setFonts(p => ({ ...p, [vid]: { resource: f.resource, family } }));
        refresh();
      }).catch(() => {
        setFonts(p => ({ ...p, [vid]: { resource: f.resource, family: 'monospace' } }));
        refresh();
      });
    } else {
      setFonts(p => ({ ...p, [vid]: { resource: f && f.resource, family: 'monospace' } }));
      refresh();
    }
  };
  return (
    <>
      <label>Font</label>
      <select value={value} onChange={e => convert(e.target.value)}>
        <optgroup label="Fonts">
          {(design.fonts || []).map(f => (
            <option key={f.id} value={'font:' + f.id}>{f.id} ({f.resource})</option>
          ))}
        </optgroup>
        {pixelIds.length > 0 && (
          <optgroup label="Pixel fonts">
            {pixelIds.map(id => (
              <option key={id} value={'pixel:' + id}>{id} (pixel)</option>
            ))}
          </optgroup>
        )}
      </select>
      <button className="btn" style={{ marginTop: 6 }} onClick={() => setUpload({})}>Upload TTF…</button>
      {upload && (
        <FontUpload S={S} toast={toast} close={() => setUpload(null)} />
      )}
    </>
  );
}

function FontUpload({ S, toast, close }) {
  const [fontId, setFontId] = useState('custom25');
  const [resource, setResource] = useState('FONT_CUSTOM_25');
  const [file, setFile] = useState(null);
  const run = () => {
    if (!file) { toast('pick a .ttf file first', 'err'); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const b64 = String(rd.result).split(',')[1];
        await api.uploadFont(S.facePath, fontId, resource, b64);
        // Reload the face to pick up fonts[] + resources map.
        window.location.reload();
      } catch (err) {
        toast('font upload failed: ' + err.message, 'err');
      }
    };
    rd.readAsDataURL(file);
  };
  return (
    <div style={{ marginTop: 8, padding: 8, background: 'var(--sunken)', borderRadius: 6 }}>
      <label>font id</label>
      <input type="text" value={fontId} onChange={e => setFontId(e.target.value)} />
      <label>resource</label>
      <input type="text" value={resource} onChange={e => setResource(e.target.value)} />
      <label>ttf file</label>
      <input type="file" accept=".ttf,.otf" onChange={e => setFile(e.target.files[0])} />
      <div className="rowbtns">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={run}>Upload</button>
      </div>
    </div>
  );
}

function ProviderPicker({ S, design, manifests, type, label, get, set }) {
  const list = (MODEL.listProviders(manifests, design.settings)[type] || [])
    .slice().sort((a, b) => (a.name < b.name ? -1 : 1));
  const current = MODEL.bindingOf(get());
  const known = list.some(p => p.name === current);
  return (
    <>
      <label>{label} (provider)</label>
      <select value={known ? current : ''} onChange={e => { if (e.target.value) set('$' + e.target.value); }}>
        {!known && <option value="">{current ? '$' + current + ' (custom)' : '(unbound)'}</option>}
        {list.map(p => (
          <option key={p.name} value={p.name}>${p.name} ⇐ {p.widget ? p.widget : p.owner}</option>
        ))}
      </select>
      <div className="hint">Picking a provider adds its widget + state to the face.</div>
    </>
  );
}

const VIS_PRESETS = {
  always: null,
  'BT disconnected': { var: 'bt', op: 'eq', value: false },
  'weather on': { any: [{ var: 'weather_enabled', op: 'eq', value: true }, { var: 'bt', op: 'eq', value: false }] },
};

function VisibilityEditor({ target, layer, updateBoth }) {
  const cur = JSON.stringify(target.visibleWhen || null);
  const match = Object.entries(VIS_PRESETS).find(([, v]) => JSON.stringify(v) === cur);
  return (
    <>
      <label>Visibility</label>
      <select value={match ? match[0] : 'custom'} onChange={e => {
        const v = e.target.value;
        if (v === 'custom') return;
        updateBoth(t => {
          if (VIS_PRESETS[v]) t.visibleWhen = JSON.parse(JSON.stringify(VIS_PRESETS[v]));
          else delete t.visibleWhen;
        });
      }}>
        {match ? null : <option value="custom">custom…</option>}
        {Object.keys(VIS_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <div className="hint">Visibility of {layer.kind === 'graphics' && target.kind ? target.kind : layer.id}.</div>
    </>
  );
}

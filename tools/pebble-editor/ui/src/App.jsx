import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MousePointer2, Square, Hexagon, BarChart3, Type,
  Undo2, Redo2, Save, Cog, Copy, FilePlus, FolderOpen, ZoomIn,
} from 'lucide-react';
import MODEL from './gen/engine.js';
import PV from './gen/preview.js';
import { api } from './api.js';
import WatchCanvas from './Canvas.jsx';
import LayersPanel from './LayersPanel.jsx';
import Inspector from './Inspector.jsx';
import StatusBar from './StatusBar.jsx';

const BLANK_FACE = 'tools/pebble-editor/examples/blank.design.json';
const REF_SUBSTR = 'neubrutalism-plus';

let toastId = 0;

export default function App() {
  const [design, setDesign] = useState(null);
  const [rev, setRev] = useState(0);
  const [facePath, setFacePath] = useState(BLANK_FACE);
  const [manifests, setManifests] = useState({});
  const [resMap, setResMap] = useState({});
  const [fonts, setFonts] = useState({});
  const [bitmaps, setBitmaps] = useState({});
  const [themeIdx, setThemeIdx] = useState(0);
  const [sim, setSim] = useState({});
  const [liveClock, setLiveClock] = useState(true);
  const [hidden, setHidden] = useState({});
  const [lockedLayers, setLockedLayers] = useState({});
  const [sel, setSel] = useState([]);
  const [activeScreen, setActiveScreen] = useState(null);
  const [tool, setTool] = useState('move');
  const [zoom, setZoom] = useState(3);
  const [undo, setUndo] = useState([]);
  const [redo, setRedo] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('loading…');
  const [saveState, setSaveState] = useState(null);
  const [modal, setModal] = useState(null);
  const [sizes, setSizes] = useState(['200', '144']);
  const [hover, setHover] = useState(null);
  const [guides, setGuides] = useState(null);

  const S = useRef({}).current;
  S.design = design; S.facePath = facePath; S.manifests = manifests;
  S.themeIdx = themeIdx; S.sim = sim; S.hidden = hidden;
  S.lockedLayers = lockedLayers; S.sel = sel; S.activeScreen = activeScreen;
  S.tool = tool; S.zoom = zoom; S.liveClock = liveClock;
  S.undo = undo; S.redo = redo; S.fonts = fonts; S.bitmaps = bitmaps;
  S.resMap = resMap;

  const refresh = useCallback(() => setRev(r => r + 1), []);

  const toast = useCallback((msg, kind) => {
    const id = ++toastId;
    setToasts(t => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  const isReference = (facePath || '').includes(REF_SUBSTR);

  /* ---------- load ---------- */

  const initSim = useCallback((doc) => {
    const s = {};
    for (const v of doc.state || []) {
      s[v.name] = v.type === 'int' ? 0 : v.type === 'bool' ? true : '';
    }
    if ('battery' in s) s.battery = 100;
    if ('steps' in s) s.steps = 40;
    if ('weather_str' in s && !s.weather_str) s.weather_str = '78°F';
    return s;
  }, []);

  const tickClock = useCallback((s) => {
    // Each clock var fills independently: a date-only face must still
    // preview without time_str present (and vice versa).
    if (!('time_str' in s) && !('date_str' in s) && !('display_hour' in s)) return false;
    const now = new Date();
    const hh = now.getHours(), mm = now.getMinutes();
    const disp = now.getHours();
    const h12 = s.h24 === false ? (hh % 12 === 0 ? 12 : hh % 12) : disp;
    const str = String(h12).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    let changed = false;
    if ('time_str' in s && s.time_str !== str) { s.time_str = str; changed = true; }
    if ('display_hour' in s && s.display_hour !== h12) { s.display_hour = h12; changed = true; }
    if ('date_str' in s) {
      const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const d = MON[now.getMonth()] + ' ' + String(now.getDate()).padStart(2, '0');
      if (s.date_str !== d) { s.date_str = d; changed = true; }
    }
    return changed;
  }, []);

  const loadFont = useCallback(async (doc, rmap, fontId, setF) => {
    const f = (doc.fonts || []).find(f => f.id === fontId);
    if (!f) return;
    const url = rmap[f.resource];
    if (!url) { setF(p => ({ ...p, [fontId]: { resource: f.resource, family: 'monospace' } })); return; }
    const family = 'PE_' + fontId;
    try {
      const face = new FontFace(family, 'url(' + url + ')');
      await Promise.race([face.load(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
      document.fonts.add(face);
      setF(p => ({ ...p, [fontId]: { resource: f.resource, family } }));
    } catch (e) {
      setF(p => ({ ...p, [fontId]: { resource: f.resource, family: 'monospace' } }));
    }
    refresh();
  }, [refresh]);

  const loadGen = useRef(0);

  const loadFace = useCallback(async (fp) => {
    const gen = ++loadGen.current;
    const alive = () => gen === loadGen.current;
    setStatus('loading ' + fp + '…');
    const { design: doc } = await api.loadDesign(fp);
    if (!alive()) return;
    let mans = {};
    try { mans = (await api.widgets()).widgets || {}; }
    catch (e) { toast('widget registry unavailable: ' + e.message, 'err'); }
    if (!alive()) return;
    setManifests(mans);
    setDesign(doc);
    setFacePath(fp);
    setThemeIdx(0);
    setHidden({});
    setLockedLayers({});
    setSel([]);
    setHover(null);
    setGuides(null);
    setUndo([]);
    setRedo([]);
    setDirty(false);
    setActiveScreen(Object.keys(doc.screens)[0]);
    const s = initSim(doc);
    tickClock(s);
    setSim(s);
    // Sizes from saved prefs or build targets.
    try {
      const saved = JSON.parse(localStorage.getItem('pe-sizes:' + fp));
      if (Array.isArray(saved) && saved.length) setSizes(saved.filter(x => x === '144' || x === '200'));
      else setSizes(MODEL.visibleSizes(doc, null));
    } catch (e) { setSizes(MODEL.visibleSizes(doc, null)); }
    // Resources (fonts + bitmaps) for preview.
    setFonts({});
    setBitmaps({});
    const base = fp.replace(/[^/]+$/, '');
    const resPath = base + fp.split('/').pop().replace(/\.design\.json$/, '.resources.json');
    let rmap = {};
    try {
      const r = await api.loadDesign(resPath);
      if (!alive()) return;
      rmap = r.design || {};
    } catch (e) { /* no resources map: fallback fonts */ }
    if (!alive()) return;
    setResMap(rmap);
    const setF = setFonts;
    for (const f of doc.fonts || []) loadFont(doc, rmap, f.id, setF);
    const bms = {};
    let pending = 0;
    for (const b of doc.bitmaps || []) {
      const url = rmap[b.resource];
      if (!url) continue;
      pending++;
      const img = new Image();
      img.onload = () => { if (--pending === 0) refresh(); };
      img.src = url;
      bms[b.id] = img;
    }
    setBitmaps(bms);
    setStatus('loaded ' + fp + (fp.includes(REF_SUBSTR) ? ' (frozen reference)' : ''));
    setSaveState(null);
    refresh();
  }, [initSim, tickClock, loadFont, refresh, toast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    loadFace(params.get('face') || BLANK_FACE).catch(e => setStatus('load failed: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!design || !liveClock) return;
    const t = setInterval(() => {
      setSim(prev => {
        const next = { ...prev };
        if (tickClock(next)) { refresh(); return next; }
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [design, liveClock, tickClock, refresh]);

  /* ---------- history ---------- */

  const snapshot = useCallback(() => {
    setUndo(u => [...u.slice(-49), JSON.stringify(S.design)]);
    setRedo([]);
  }, [S]);

  const restore = useCallback((json) => {
    S.design = JSON.parse(json);
    setDesign(S.design);
    setSel([]);
    setDirty(true);
    refresh();
  }, [S, refresh]);

  const doUndo = useCallback(() => {
    if (!S.undo.length) return;
    setRedo(r => [...r, JSON.stringify(S.design)]);
    const prev = S.undo[S.undo.length - 1];
    setUndo(u => u.slice(0, -1));
    restore(prev);
    toast('undo');
  }, [S, restore, toast]);

  const doRedo = useCallback(() => {
    if (!S.redo.length) return;
    setUndo(u => [...u, JSON.stringify(S.design)]);
    const next = S.redo[S.redo.length - 1];
    setRedo(r => r.slice(0, -1));
    restore(next);
    toast('redo');
  }, [S, restore, toast]);

  const mutate = useCallback((fn, msg) => {
    snapshot();
    try {
      fn(S.design);
    } catch (e) {
      setUndo(u => u.slice(0, -1));
      toast('failed: ' + e.message, 'err');
      return false;
    }
    setDesign(S.design);
    setDirty(true);
    refresh();
    if (msg) { toast(msg); setStatus(msg); }
    return true;
  }, [S, snapshot, refresh, toast]);

  const touch = useCallback(() => {
    setDesign(S.design);
    setDirty(true);
    refresh();
  }, [S, refresh]);

  const popSnapshot = useCallback(() => setUndo(u => u.slice(0, -1)), []);

  /* ---------- shared helpers ---------- */

  const visState = () => ({ themeIdx: S.themeIdx, state: S.sim, hidden: S.hidden, locked: S.lockedLayers });

  const providerOf = (name) => {
    const all = MODEL.listProviders(S.manifests, (S.design || {}).settings);
    for (const t of Object.keys(all)) {
      const hit = all[t].find(p => p.name === name);
      if (hit) return hit;
    }
    return null;
  };

  const guardFrozen = () => {
    if (isReference) {
      toast('reference face is frozen — Duplicate it first', 'err');
      return true;
    }
    return false;
  };

  // Seed the preview simulator when a provider adds a brand-new state var.
  // Without this the new binding renders nothing (undefined text, 0% bars)
  // until the user hand-types a sim value.
  const seedSimVar = useCallback((name, type) => {
    setSim(prev => {
      if (name in prev) return prev;
      const next = { ...prev };
      if (type === 'bool') next[name] = true;
      else if (type === 'int') next[name] = name === 'battery' ? 100 : name === 'steps' ? 40 : 0;
      else next[name] = name === 'weather_str' ? '78°F' : '';
      tickClock(next);
      return next;
    });
  }, [tickClock]);

  /* ---------- save / generate / faces ---------- */

  const doSave = useCallback(async () => {
    if (!S.design || guardFrozen()) return;
    try {
      await api.saveDesign(S.facePath, S.design);
      setDirty(false);
      setSaveState({ ok: true });
      toast('saved ' + S.facePath);
      setStatus('saved ' + S.facePath);
    } catch (e) {
      setSaveState({ ok: false, error: e.message });
      toast('save failed: ' + e.message, 'err');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S]);

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave();
        return;
      }
      const k = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (k === 'v') { setTool('move'); return; }
        if (k === 'r') { setTool('rect'); return; }
        if (k === 'b') { setTool('bar'); return; }
        if (k === 't') { setTool('text'); return; }
        if (k === 'p') { setTool('polygon'); return; }
        if (k === 'escape') { setTool('move'); setSel([]); refresh(); return; }
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(e.key)) return;
      const sid = S.activeScreen;
      if (!sid || !S.sel.length) return;
      e.preventDefault();
      if (guardFrozen()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      mutate((doc) => {
        const sc = doc.screens[sid];
        for (const s of S.sel) {
          const g = s.group ? sc.groups.find(g => g.id === s.group) : MODEL.groupContaining(doc, sid, s.layer, s.item);
          if (g && (s.group || g.locked)) {
            if (g.locked) continue;
            MODEL.moveGroup(doc, sid, g.id, dx, dy);
          } else {
            MODEL.moveTarget(doc, sid, { layer: s.layer, item: s.item }, dx, dy);
          }
        }
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, mutate]);

  /* ---------- delete / groups ---------- */

  const pruneMembers = (doc, sid, layerId, itemIdx) => {
    // Remove group members pointing at a deleted target; drop emptied groups.
    const sc = doc.screens[sid];
    sc.groups = (sc.groups || []).filter(g => {
      g.members = g.members.filter(m => {
        if (m.layer !== layerId) return true;
        if (itemIdx === null || itemIdx === undefined) return false;
        if (m.item === undefined) return true; // whole-layer member survives item delete
        if (m.item === itemIdx) return false;
        if (m.item > itemIdx) m.item--;
        return true;
      });
      return g.members.length > 0;
    });
  };

  const deleteSelection = useCallback(() => {
    const sid = S.activeScreen;
    if (!sid || !S.sel.length || guardFrozen()) return;
    if (!window.confirm('Delete selection on both sizes?')) return;
    mutate((doc) => {
      const sibId = MODEL.siblingScreenId(doc, sid);
      // Delete deepest-first so item indices stay valid.
      const ordered = [...S.sel].sort((a, b) =>
        (b.item === null || b.item === undefined ? -1 : b.item) - (a.item === null || a.item === undefined ? -1 : a.item));
      for (const s of ordered) {
        if (s.group) continue;
        const layer = doc.screens[sid].layers[s.layer];
        if (!layer) continue;
        if (s.item !== null && s.item !== undefined) {
          MODEL.deleteItem(doc, sid, s.layer, s.item);
          pruneMembers(doc, sid, layer.id, s.item);
          if (sibId) {
            const sib = doc.screens[sibId];
            const di = sib.layers.findIndex(l => l.id === layer.id);
            if (di >= 0 && sib.layers[di].items.length) {
              sib.layers[di].items.splice(Math.min(s.item, sib.layers[di].items.length - 1), 1);
              pruneMembers(doc, sibId, layer.id, s.item);
            }
          }
        } else {
          MODEL.deleteLayer(doc, sid, s.layer);
          pruneMembers(doc, sid, layer.id, null);
          if (sibId) {
            const di = doc.screens[sibId].layers.findIndex(l => l.id === layer.id);
            if (di >= 0) {
              MODEL.deleteLayer(doc, sibId, di);
              pruneMembers(doc, sibId, layer.id, null);
            }
          }
        }
      }
      const pruned = MODEL.pruneUnusedWidgets(doc, S.manifests);
      if (pruned.widgets.length) toast('pruned widgets: ' + pruned.widgets.join(', '));
    }, 'deleted selection');
    setSel([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, mutate]);

  const groupSelection = useCallback(() => {
    const sid = S.activeScreen;
    if (!sid || S.sel.length < 2 || guardFrozen()) return;
    const label = window.prompt('Group name:', 'my group');
    if (!label) return;
    mutate((doc) => {
      const sc = doc.screens[sid];
      const members = S.sel.filter(s => !s.group).map(s => ({
        layer: sc.layers[s.layer].id,
        ...(s.item !== null && s.item !== undefined ? { item: s.item } : {}),
      }));
      const gid = MODEL.createGroup(doc, sid, label, members);
      MODEL.mirrorGroupToSibling(doc, sid, gid);
      setSel([{ group: gid }]);
    }, 'grouped: ' + label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, mutate]);

  /* ---------- screens to show ---------- */

  const screenEntries = design ? Object.entries(design.screens).filter(([, sc]) =>
    (sc.w === 200 && sizes.includes('200')) || (sc.w === 144 && sizes.includes('144'))) : [];

  const emptyStage = design && Object.values(design.screens).every(sc =>
    sc.layers.length <= 1 && (sc.layers[0].items || []).length <= 1 &&
    !MODEL.collectRefs(design).bindings.size);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="topbar">
        <div className="brand"><b>◼</b> Pebble Editor</div>
        <div className="toolset" role="toolbar" aria-label="Tools">
          <ToolButton id="move" title="Move (V)" tool={tool} setTool={setTool} Icon={MousePointer2} />
          <ToolButton id="rect" title="Rectangle (R)" tool={tool} setTool={setTool} Icon={Square} />
          <ToolButton id="polygon" title="Polygon (P)" tool={tool} setTool={setTool} Icon={Hexagon} />
          <ToolButton id="bar" title="Progress bar (B)" tool={tool} setTool={setTool} Icon={BarChart3} />
          <ToolButton id="text" title="Text (T) — vector or pixel font" tool={tool} setTool={setTool} Icon={Type} />
        </div>
        <div className="facebox" title={facePath}>
          <FolderOpen size={13} />
          <span>{facePath}</span>
          {isReference && <span className="refbadge">FROZEN</span>}
        </div>
        <div className="spacer" />
        <div className="zoombox">
          <ZoomIn size={13} />
          <select value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 70 }} aria-label="Zoom">
            {[1, 2, 3, 4, 6].map(z => <option key={z} value={z}>{z}x</option>)}
          </select>
        </div>
        <button className="btn" onClick={doUndo} disabled={!undo.length} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
        <button className="btn" onClick={doRedo} disabled={!redo.length} title="Redo"><Redo2 size={14} /></button>
        <button className="btn" onClick={() => setModal({ kind: 'open' })} title="Open face"><FolderOpen size={14} /></button>
        <button className="btn" onClick={() => setModal({ kind: 'duplicate', dst: facePath.replace(/\.design\.json$/, '-copy.design.json') })} title="Duplicate face"><Copy size={14} /></button>
        <button className="btn" onClick={() => setModal({ kind: 'new', dst: 'tools/pebble-editor/examples/my-face.design.json', name: 'My Face', template: 'blank' })} title="New face"><FilePlus size={14} /></button>
        <button className="btn primary" onClick={doSave} title="Save (Ctrl+S)"><Save size={14} /> Save</button>
        <button className="btn" onClick={() => setModal({ kind: 'generate', outDir: 'src/c' })} title="Generate C"><Cog size={14} /></button>
      </header>

      <div className="workbench">
        <aside className="side left">
          <LayersPanel
            S={S} design={design} manifests={manifests} providerOf={providerOf}
            sel={sel} setSel={setSel} activeScreen={activeScreen} setActiveScreen={setActiveScreen}
            hidden={hidden} setHidden={setHidden} lockedLayers={lockedLayers} setLockedLayers={setLockedLayers}
            mutate={mutate} refresh={refresh} sizes={sizes} setSizes={setSizes} facePath={facePath}
            sim={sim} setSim={setSim} themeIdx={themeIdx} setThemeIdx={setThemeIdx}
            liveClock={liveClock} setLiveClock={setLiveClock} refreshSim={() => refresh()}
          />
        </aside>

        <main className="stage">
          {screenEntries.map(([sid, sc]) => (
            <WatchCanvas
              key={sid} S={S} design={design} screenId={sid} zoom={zoom}
              fonts={fonts} bitmaps={bitmaps} sel={sel} setSel={setSel}
              hover={hover} setHover={setHover} guides={guides} setGuides={setGuides}
              toast={toast} setStatus={setStatus} setTool={setTool}
              setActiveScreen={setActiveScreen} snapshot={snapshot}
              popSnapshot={popSnapshot} touch={touch} seedSimVar={seedSimVar}
              loadFont={loadFont} visState={visState} guardFrozen={guardFrozen}
              hidden={hidden} refresh={refresh}
            />
          ))}
          {screenEntries.length === 0 && <div className="stage-hint">no sizes enabled — tick 144 / 200 in the Layers panel</div>}
          {emptyStage && screenEntries.length > 0 && (
            <div className="stage-hint"><b>R</b> rect · <b>B</b> bar · <b>T</b> text · <b>P</b> polygon — drag on the canvas, <b>V</b> to move</div>
          )}
        </main>

        <aside className="side right">
          <Inspector
            S={S} design={design} manifests={manifests} providerOf={providerOf}
            sel={sel} setSel={setSel} mutate={mutate} toast={toast}
            deleteSelection={deleteSelection} groupSelection={groupSelection}
            setFonts={setFonts} refresh={refresh} seedSimVar={seedSimVar}
          />
        </aside>
      </div>

      <StatusBar S={S} design={design} dirty={dirty} status={status} saveState={saveState} sel={sel} />

      <div className="toasts">
        {toasts.map(t => <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '')}>{t.msg}</div>)}
      </div>

      {modal && (
        <FaceModal
          modal={modal} setModal={setModal} facePath={facePath}
          loadFace={loadFace} toast={toast} setStatus={setStatus}
        />
      )}
    </div>
  );
}

function ToolButton({ id, title, tool, setTool, Icon }) {
  return (
    <button
      className={'tool' + (tool === id ? ' active' : '')}
      title={title}
      onClick={() => setTool(tool === id && id !== 'move' ? 'move' : id)}
    >
      <Icon size={15} />
    </button>
  );
}

function FaceModal({ modal, setModal, facePath, loadFace, toast, setStatus }) {
  const [dst, setDst] = useState(modal.dst || facePath);
  const [name, setName] = useState(modal.name || 'My Face');
  const [template, setTemplate] = useState(modal.template || 'blank');
  const [outDir, setOutDir] = useState(modal.outDir || 'src/c');
  const [path, setPath] = useState(facePath);
  const close = () => setModal(null);
  const run = async (fn, okMsg) => {
    try { await fn(); close(); toast(okMsg); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {modal.kind === 'open' && (
          <>
            <h3>Open face</h3>
            <label>design.json path</label>
            <input type="text" value={path} onChange={e => setPath(e.target.value)} />
            <div className="rowbtns">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={() => run(() => loadFace(path.trim()), 'loaded ' + path)}>Load</button>
            </div>
          </>
        )}
        {modal.kind === 'duplicate' && (
          <>
            <h3>Duplicate face</h3>
            <label>new path</label>
            <input type="text" value={dst} onChange={e => setDst(e.target.value)} />
            <div className="rowbtns">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={() => run(async () => {
                await api.duplicateFace(facePath, dst);
                await loadFace(dst);
                setStatus('duplicated to ' + dst);
              }, 'duplicated')}>Duplicate</button>
            </div>
          </>
        )}
        {modal.kind === 'new' && (
          <>
            <h3>New face</h3>
            <label>path</label>
            <input type="text" value={dst} onChange={e => setDst(e.target.value)} />
            <label>display name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} />
            <label>template</label>
            <select value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="blank">Blank (white)</option>
              <option value="starter">Starter</option>
            </select>
            <div className="rowbtns">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={() => run(async () => {
                await api.newFace(dst, name, template);
                await loadFace(dst);
              }, 'created ' + dst)}>Create</button>
            </div>
          </>
        )}
        {modal.kind === 'generate' && (
          <>
            <h3>Generate C</h3>
            <label>output dir (repo-relative)</label>
            <input type="text" value={outDir} onChange={e => setOutDir(e.target.value)} />
            <div className="rowbtns">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={() => run(async () => {
                const data = await api.generate(facePath, outDir);
                setStatus(data.output || 'generated');
              }, 'generated C → ' + outDir)}>Generate</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

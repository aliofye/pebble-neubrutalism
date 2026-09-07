import React, { useState } from 'react';
import {
  Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown,
  Folder, FolderOpen, Ungroup, Trash2, Pencil,
} from 'lucide-react';
import MODEL from './gen/engine.js';

// Left panel: layers + items + groups, provider inventory, sizes, simulator.
export default function LayersPanel(props) {
  const { S, design, manifests, providerOf, sel, setSel } = props;
  const { activeScreen, setActiveScreen, hidden, setHidden, lockedLayers, setLockedLayers } = props;
  const { mutate, refresh, sizes, setSizes, sim, setSim, themeIdx, setThemeIdx } = props;
  const { liveClock, setLiveClock } = props;
  const [collapsedGroups, setCollapsedGroups] = useState({});

  if (!design) return <div className="prov">loading…</div>;
  const sc = design.screens[activeScreen] || design.screens[Object.keys(design.screens)[0]];
  const sid = design.screens[activeScreen] ? activeScreen : Object.keys(design.screens)[0];

  const isSel = (layer, item) => sel.some(s =>
    !s.group && (s.screen === undefined || s.screen === sid) &&
    s.layer === layer && (s.item ?? null) === (item ?? null));

  const pick = (layer, item) => {
    setActiveScreen(sid);
    S.activeScreen = sid;
    setSel([{ screen: sid, layer, item: item ?? null }]);
    refresh();
  };

  const toggleHidden = (id) => {
    setHidden(h => {
      const n = { ...h };
      if (n[id]) delete n[id]; else n[id] = true;
      return n;
    });
    refresh();
  };

  const toggleLock = (id) => {
    setLockedLayers(l => {
      const n = { ...l };
      if (n[id]) delete n[id]; else n[id] = true;
      return n;
    });
    refresh();
  };

  const reorder = (li, dir) => {
    mutate((doc) => {
      const layers = doc.screens[sid].layers;
      const to = li + dir;
      if (to < 0 || to >= layers.length) return;
      const [m] = layers.splice(li, 1);
      layers.splice(to, 0, m);
      setSel([{ screen: sid, layer: to, item: null }]);
    });
  };

  const bindingChip = (ref) => {
    const name = MODEL.bindingOf(ref);
    if (!name) return null;
    const p = providerOf(name);
    if (!p) return <span className="chip warn">${name} ⚠</span>;
    if (p.widget && !(design.widgets || []).includes(p.widget)) {
      return <span className="chip warn">${name} ⚠ {p.widget} off</span>;
    }
    return <span className="chip">${name} ⇐ {p.widget || p.owner}</span>;
  };

  const refs = MODEL.collectRefs(design);
  const allProviders = MODEL.listProviders(manifests, design.settings);
  const flat = [...allProviders.string, ...allProviders.int, ...allProviders.bool];
  const unused = flat.filter(p => p.widget && (design.widgets || []).includes(p.widget) && !refs.all.has(p.name));

  return (
    <div>
      <div className="sec">Canvas</div>
      <div style={{ display: 'flex', gap: 8, padding: '0 4px' }}>
        {Object.entries(design.screens).map(([id, s]) => (
          <label key={id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
            <input
              type="radio" name="screen" checked={sid === id}
              onChange={() => { setActiveScreen(id); S.activeScreen = id; setSel([]); refresh(); }}
            />
            {s.w}
          </label>
        ))}
        <span style={{ flex: 1 }} />
        {['200', '144'].map(z => (
          <label key={z} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
            <input
              type="checkbox" checked={sizes.includes(z)}
              onChange={() => {
                const n = sizes.includes(z) ? sizes.filter(x => x !== z) : [...sizes, z];
                if (!n.length) return;
                setSizes(n);
                try { localStorage.setItem('pe-sizes:' + S.facePath, JSON.stringify(n)); } catch (e) { /* private mode */ }
              }}
            />
            {z}
          </label>
        ))}
      </div>

      <div className="sec">Layers</div>
      {sc.layers.map((layer, li) => (
        <div key={layer.id}>
          <div className={'lrow' + (isSel(li, null) && sel.length === 1 ? ' sel' : '')}>
            <button className="iconbtn" title="Toggle preview visibility" onClick={() => toggleHidden(layer.id)}>
              {hidden[layer.id] ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button className={'iconbtn' + (lockedLayers[layer.id] ? ' on' : '')} title="Lock layer" onClick={() => toggleLock(layer.id)}>
              {lockedLayers[layer.id] ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <span className="nm" onClick={() => pick(li, null)}>{layer.id}</span>
            <span className="kind">{layer.kind === 'pixeltext' || layer.pixelFont ? 'pixel' : layer.kind}</span>
            {(layer.kind === 'text' || layer.kind === 'pixeltext') && bindingChip(layer.text)}
            {layer.kind === 'graphics' && layer.items.some(it => it.value) &&
              bindingChip(layer.items.find(it => it.value).value)}
            <button className="iconbtn" title="Bring forward" onClick={() => reorder(li, 1)}><ChevronUp size={14} /></button>
            <button className="iconbtn" title="Send backward" onClick={() => reorder(li, -1)}><ChevronDown size={14} /></button>
          </div>
          {layer.kind === 'graphics' && (layer.items || []).map((item, ii) => (
            <div key={ii} className={'irow' + (isSel(li, ii) ? ' sel' : '')} onClick={() => pick(li, ii)}>
              <span>{item.kind}</span>
              {item.value && bindingChip(item.value)}
            </div>
          ))}
        </div>
      ))}

      <div className="sec">Groups</div>
      {(!(sc.groups || []).length) && <div className="prov">no groups — Shift+click 2+ targets, then Group in the inspector</div>}
      {(sc.groups || []).map(g => (
        <GroupRow key={g.id} S={S} design={design} sid={sid} group={g} sel={sel} setSel={setSel}
          mutate={mutate} refresh={refresh} collapsed={!!collapsedGroups[g.id]}
          setCollapsed={(v) => setCollapsedGroups(c => ({ ...c, [g.id]: v }))} />
      ))}

      <div className="sec">Providers</div>
      <div className="prov">
        {flat.filter(p => refs.all.has(p.name)).map(p => (
          <div key={p.name}>${p.name} ⇐ {p.widget || p.owner}</div>
        ))}
        {unused.map(p => (
          <div key={p.name} className="unused">${p.name} unused ({p.widget})</div>
        ))}
        {!flat.length && 'no providers'}
      </div>

      <div className="sec">Simulate</div>
      <div className="simrow">
        <span>theme</span>
        <select value={themeIdx} onChange={e => { setThemeIdx(+e.target.value); refresh(); }}>
          {design.themes.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
        </select>
      </div>
      <div className="simrow">
        <span>live clock</span>
        <input type="checkbox" checked={liveClock} onChange={e => setLiveClock(e.target.checked)} />
      </div>
      {(design.state || []).filter(v => v.name !== 'weather_code').map(v => (
        <div className="simrow" key={v.name}>
          <span>{v.name}</span>
          {v.type === 'int' && (
            <input type="number" value={sim[v.name] ?? 0}
              onChange={e => { setSim(s => ({ ...s, [v.name]: +e.target.value })); refresh(); }} />
          )}
          {v.type === 'bool' && (
            <input type="checkbox" checked={!!sim[v.name]}
              onChange={e => { setSim(s => ({ ...s, [v.name]: e.target.checked })); refresh(); }} />
          )}
          {v.type === 'string' && (
            <input type="text" value={sim[v.name] ?? ''}
              onChange={e => { setSim(s => ({ ...s, [v.name]: e.target.value })); refresh(); }} />
          )}
        </div>
      ))}
      <div className="simrow">
        <span>weather_code</span>
        <select
          value={sim.weather_available ? sim.weather_code : 'x'}
          onChange={e => {
            const v = e.target.value;
            setSim(s => v === 'x'
              ? { ...s, weather_available: false }
              : { ...s, weather_available: true, weather_code: +v });
            refresh();
          }}>
          {[['unavailable', 'x'], ['0 clear', 0], ['3 overcast', 3], ['51 drizzle', 51], ['61 rain', 61], ['71 snow', 71], ['95 storm', 95]].map(([label, val]) => (
            <option key={label} value={val}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function GroupRow({ S, design, sid, group, sel, setSel, mutate, refresh, collapsed, setCollapsed }) {
  const [renaming, setRenaming] = useState(false);
  const selected = sel.some(s => s.group === group.id);
  const sc = design.screens[sid];

  const selectMembers = () => {
    const out = [];
    for (const m of group.members) {
      const r = MODEL.resolveMember(design, sid, m);
      if (r) out.push({ screen: sid, layer: r.layer, item: r.item });
    }
    setSel(out.length ? out : [{ screen: sid, group: group.id }]);
    refresh();
  };

  return (
    <div>
      <div className={'grow' + (selected ? ' sel' : '') + (group.locked ? ' locked' : '')}>
        <button className="iconbtn" title={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
        </button>
        {renaming ? (
          <input
            type="text" defaultValue={group.label || group.id} autoFocus
            onBlur={e => {
              const v = e.target.value.trim();
              if (v) mutate(doc => { doc.screens[sid].groups.find(g => g.id === group.id).label = v; });
              setRenaming(false);
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          />
        ) : (
          <span className="nm" onClick={selectMembers} title={group.id}>{group.label || group.id}</span>
        )}
        <button className={'iconbtn' + (group.locked ? ' on' : '')} title={group.locked ? 'Unlock' : 'Lock'}
          onClick={() => mutate(doc => { MODEL.setGroupLock(doc, sid, group.id, !group.locked); }, group.locked ? 'unlocked ' + group.id : 'locked ' + group.id)}>
          {group.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <button className="iconbtn" title="Rename" onClick={() => setRenaming(true)}><Pencil size={14} /></button>
        <button className="iconbtn" title="Ungroup (keep members)" onClick={() => {
          mutate(doc => { MODEL.deleteGroup(doc, sid, group.id); }, 'ungrouped ' + group.id);
          setSel([]);
        }}><Ungroup size={14} /></button>
        <button className="iconbtn" title="Delete group + members" onClick={() => {
          if (!window.confirm('Delete group "' + group.id + '" and its members on both sizes?')) return;
          mutate(doc => {
            // Deepest item indices first.
            const mems = [...group.members].sort((a, b) => (b.item ?? -1) - (a.item ?? -1));
            for (const m of mems) {
              const r = MODEL.resolveMember(doc, sid, m);
              if (!r) continue;
              if (r.item === null) MODEL.deleteLayer(doc, sid, r.layer);
              else doc.screens[sid].layers[r.layer].items.splice(r.item, 1);
            }
            MODEL.deleteGroup(doc, sid, group.id);
            const sib = MODEL.siblingScreenId(doc, sid);
            if (sib) {
              const sg = (doc.screens[sib].groups || []).find(g => g.id === group.id);
              if (sg) {
                for (const m of [...sg.members].sort((a, b) => (b.item ?? -1) - (a.item ?? -1))) {
                  const r = MODEL.resolveMember(doc, sib, m);
                  if (!r) continue;
                  if (r.item === null) MODEL.deleteLayer(doc, sib, r.layer);
                  else doc.screens[sib].layers[r.layer].items.splice(r.item, 1);
                }
                MODEL.deleteGroup(doc, sib, group.id);
              }
            }
            MODEL.pruneUnusedWidgets(doc, S.manifests);
          }, 'deleted group ' + group.id);
          setSel([]);
        }}><Trash2 size={14} /></button>
      </div>
      {!collapsed && group.members.map((m, i) => {
        const r = MODEL.resolveMember(design, sid, m);
        const li = sc.layers.findIndex(l => l.id === m.layer);
        return (
          <div key={i} className="irow"
            onClick={() => { if (r) { setSel([{ screen: sid, layer: r.layer, item: r.item }]); refresh(); } }}>
            <span>{m.layer}{m.item !== undefined ? ' #' + m.item : ''}{r ? '' : ' ⚠'}</span>
            <span className="chip">{li >= 0 ? (sc.layers[li].kind === 'graphics' && m.item !== undefined ? sc.layers[li].items[m.item]?.kind : sc.layers[li].kind) : '?'}</span>
          </div>
        );
      })}
    </div>
  );
}

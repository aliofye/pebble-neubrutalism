import React from 'react';

// Bottom strip: save state, last action, selection readout. Linear-style.
export default function StatusBar({ S, design, dirty, status, saveState, sel }) {
  const sid = S.activeScreen && design && design.screens[S.activeScreen]
    ? S.activeScreen : null;
  const selText = !sel.length ? 'nothing selected'
    : sel.length === 1
      ? (sel[0].group ? 'group ' + sel[0].group
        : (() => {
          const layer = design.screens[sid]?.layers[sel[0].layer];
          return (layer ? layer.id : '?') + (sel[0].item !== null && sel[0].item !== undefined ? ' #' + sel[0].item : '');
        })())
      : sel.length + ' selected';
  return (
    <footer className="statusbar">
      <span className={'dot' + (dirty ? ' dirty' : '')} title={dirty ? 'unsaved changes' : 'saved'} />
      {saveState && !saveState.ok && <span className="err">save failed: {saveState.error}</span>}
      {saveState && saveState.ok && !dirty && <span className="ok">saved</span>}
      <span>{status || ''}</span>
      <span className="spacer" />
      <span>{selText}</span>
      {sid && design && <span>{design.screens[sid].w}×{design.screens[sid].h}</span>}
      <span>R rect · B bar · T text · P poly · V move · Del</span>
    </footer>
  );
}

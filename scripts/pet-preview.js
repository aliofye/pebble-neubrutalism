#!/usr/bin/env node
/*
 * Pet sprite preview tool.
 *
 * Parses the sprite grids out of src/c/pet.c and:
 *   1. prints scaled ASCII previews to the terminal (for fast iteration), and
 *   2. writes a standalone HTML file (build/pet-preview.html) that renders every
 *      mood/frame at scale with an animated idle loop, then opens it in the
 *      default browser.
 *
 * Usage:
 *   node scripts/pet-preview.js [--no-open]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PET_SRC = path.join(ROOT, "src", "c", "pet.c");
const OUT_HTML = path.join(ROOT, "build", "pet-preview.html");
const SHEET_SRC = path.join(ROOT, "resources", "pet", "slime_calciumtrice.png");
const SHEET_DST = path.join(ROOT, "build", "slime_calciumtrice.png");

const noOpen = process.argv.includes("--no-open");

const petSrc = fs.readFileSync(PET_SRC, "utf8");

function extractFrames(src) {
  const frames = {};
  const blockRe = /static const char \*s_(\w+)\[PET_H\] = \{\s*\n((?:.|\n)*?)\};/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const name = m[1];
    const rows = [];
    const rowRe = /"([^"]*)"/g;
    let r;
    while ((r = rowRe.exec(m[2]))) rows.push(r[1]);
    frames[name] = rows;
  }
  return frames;
}

function ascii(rows) {
  const w = rows[0].length;
  const out = [];
  out.push("+" + "-".repeat(w * 2) + "+");
  for (const row of rows) {
    if (row.length !== w) out.push("!! len " + row.length + ": " + JSON.stringify(row));
    out.push("|" + row.replace(/#/g, "\u2588\u2588").replace(/w/g, "\u2591\u2591").replace(/ /g, "  ") + "|");
  }
  out.push("+" + "-".repeat(w * 2) + "+");
  return out.join("\n");
}

const frames = extractFrames(petSrc);
if (!Object.keys(frames).length) {
  console.log("No hand-drawn grids found in " + PET_SRC + " — skipping mood panels (sprite sheet section only).");
}

// Validate: every row in a frame must be the same width, and all frames
// must share that width (the C draw loop assumes a uniform grid).
let gridW = 0;
let errors = 0;
for (const [name, rows] of Object.entries(frames)) {
  for (const r of rows) {
    if (!gridW) gridW = r.length;
    if (r.length !== gridW) {
      console.error(`!! ${name}: row length ${r.length}, expected ${gridW}: ${JSON.stringify(r)}`);
      errors++;
    }
  }
}
if (errors) {
  console.error("Sprite grids are inconsistent — fix before previewing.");
  process.exit(1);
}

for (const [name, rows] of Object.entries(frames)) {
  console.log("=== " + name + " ===");
  console.log(ascii(rows));
  console.log();
}

// Mood -> {base, breath, blink} mapping mirrors the s_frames table in pet.c.
const moods = [
  { id: "neutral", label: "Neutral", frames: ["neutral_base", "neutral_breath", "neutral_blink"] },
  { id: "happy", label: "Happy", frames: ["happy_base", "happy_breath", "neutral_blink"] },
  { id: "sad", label: "Sad", frames: ["sad_base", null, "sad_base"] },
  { id: "scared", label: "Scared", frames: ["scared_base", null, "scared_base"] },
];

const data = {};
for (const [name, rows] of Object.entries(frames)) {
  data[name] = rows;
}

const moodJson = JSON.stringify(
  Object.keys(frames).length
    ? moods.map((m) => ({
        id: m.id,
        label: m.label,
        base: m.frames[0],
        breath: m.frames[1],
        blink: m.frames[2],
      }))
    : []
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pixel Pet Preview</title>
<style>
  :root { --pastel: #f7f3a5; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #1e1e28; color: #eee;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #999; margin: 0 0 16px; font-size: 13px; }
  .toolbar { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; font-size: 13px; }
  .toolbar label { display: flex; align-items: center; gap: 6px; }
  select, button { background: #333; color: #eee; border: 1px solid #555; border-radius: 6px; padding: 4px 8px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
  .panel { background: #2a2a38; border: 1px solid #3a3a4c; border-radius: 10px; padding: 16px; }
  .panel h2 { margin: 0 0 12px; font-size: 15px; }
  .row { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
  .cell { text-align: center; }
  .cell .label { font-size: 11px; color: #999; margin-top: 6px; text-transform: uppercase; letter-spacing: .05em; }
  canvas { background: var(--bg, var(--pastel)); border-radius: 6px; image-rendering: pixelated; }
  .anim { margin-bottom: 14px; }
  pre {
    margin-top: 12px; font-size: 10px; line-height: 1.15; color: #8a8a9a;
    background: #23232f; padding: 8px; border-radius: 6px; overflow: auto;
  }
  .checker { background: repeating-conic-gradient(#3a3a4c 0 25%, #2a2a38 0 50%) 0 0 / 12px 12px !important; }
</style>
</head>
<body>
  <h1>Pixel Pet Preview</h1>
  <p class="sub">Rendered from <code>src/c/pet.c</code> — edit the sprites, run <code>node scripts/pet-preview.js</code>, refresh.</p>
  <div class="toolbar">
    <label>Scale
      <select id="scale">
        <option value="2">2px (144px screens)</option>
        <option value="3" selected>3px (200px screens)</option>
        <option value="6">6px (zoom)</option>
      </select>
    </label>
    <label>Background
      <select id="bg">
        <option value="pastel" selected>Pastel yellow</option>
        <option value="white">White</option>
        <option value="checker">Checkerboard</option>
      </select>
    </label>
    <label>Animation
      <button id="play">Pause</button>
    </label>
  </div>
  <div class="grid" id="grid"></div>
<script>
const MOODS = ${moodJson};
const FRAMES = ${JSON.stringify(data)};

let scale = 3;
let playing = true;

const grid = document.getElementById("grid");

function buildPanels() {
  grid.innerHTML = "";
  for (const mood of MOODS) {
    const panel = document.createElement("div");
    panel.className = "panel";
    const h = document.createElement("h2");
    h.textContent = mood.label;
    panel.appendChild(h);

    const anim = document.createElement("div");
    anim.className = "cell anim";
    const animCanvas = document.createElement("canvas");
    const animLabel = document.createElement("div");
    animLabel.className = "label";
    animLabel.textContent = "idle animation";
    anim.appendChild(animCanvas);
    anim.appendChild(animLabel);
    panel.appendChild(anim);

    const row = document.createElement("div");
    row.className = "row";
    for (const [key, label] of [["base", "base"], ["breath", "breath"], ["blink", "blink"]]) {
      const f = mood[key];
      if (!f) continue;
      const cell = document.createElement("div");
      cell.className = "cell";
      const c = document.createElement("canvas");
      cell.appendChild(c);
      const l = document.createElement("div");
      l.className = "label";
      l.textContent = label;
      cell.appendChild(l);
      row.appendChild(cell);
    }
    panel.appendChild(row);

    const pre = document.createElement("pre");
    pre.textContent = FRAMES[mood.base].join("\\n");
    panel.appendChild(pre);

    panel._anim = animCanvas;
    panel._static = [];
    const frames = [mood.base, mood.breath, mood.blink].filter(Boolean);
    for (let i = 0; i < row.children.length; i++) {
      panel._static.push([row.children[i].firstChild, frames[i]]);
    }
    grid.appendChild(panel);
  }
  drawAll();
}

function pickFrame(mood, tick) {
  const phase = tick % 20;
  if (phase >= 16) return mood.blink ? FRAMES[mood.blink] : FRAMES[mood.base];
  if (mood.breath && phase % 2 === 1) return FRAMES[mood.breath];
  return FRAMES[mood.base];
}

function drawRows(canvas, rows, cell) {
  const w = rows[0].length, h = rows.length;
  canvas.width = w * cell;
  canvas.height = h * cell;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === "#") ctx.fillStyle = "#000";
      else if (ch === "w") ctx.fillStyle = "#fff";
      else continue;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function applyBg() {
  const bg = document.getElementById("bg").value;
  const root = document.documentElement;
  if (bg === "pastel") root.style.setProperty("--bg", "var(--pastel)");
  else if (bg === "white") root.style.setProperty("--bg", "#ffffff");
  else root.style.setProperty("--bg", "");
  for (const panel of grid.children) {
    panel.classList.toggle("checker", bg === "checker");
  }
}

function drawAll() {
  for (const panel of grid.children) {
    const mood = MOODS.find((m) => m.label === panel.querySelector("h2").textContent);
    for (const [canvas, rows] of panel._static) {
      drawRows(canvas, rows, scale);
    }
  }
}

let tick = 0;
const TICK_MS = 400;
function animate() {
  if (playing) {
    for (const panel of grid.children) {
      const mood = MOODS.find((m) => m.label === panel.querySelector("h2").textContent);
      drawRows(panel._anim, pickFrame(mood, tick), scale);
    }
    tick = (tick + 1) % 100000;
  }
  setTimeout(animate, TICK_MS);
}

document.getElementById("scale").addEventListener("change", (e) => {
  scale = Number(e.target.value);
  drawAll();
});
document.getElementById("bg").addEventListener("change", applyBg);
document.getElementById("play").addEventListener("click", () => {
  playing = !playing;
  document.getElementById("play").textContent = playing ? "Pause" : "Play";
});

buildPanels();
applyBg();
animate();
</script>

<div class="sprite-test" style="margin-top:40px">
  <h1 style="margin-bottom:4px">Sprite Sheet Test</h1>
  <p class="sub" style="margin-bottom:16px"><b>Animated Slime</b> by Calciumtrice (OpenGameArt, CC-BY 3.0) — 32&times;32, 10 frames per animation, 4 colors.</p>
  <div class="toolbar">
    <label>Animation
      <select id="anim"></select>
    </label>
    <label>Color
      <select id="scolor"><option>1</option><option>2</option><option>3</option><option>4</option></select>
    </label>
    <label>Scale
      <select id="sscale"><option value="2">2</option><option value="3" selected>3</option><option value="6">6</option></select>
    </label>
  </div>
  <div class="cell"><canvas id="sprite-canvas" style="background:#fff"></canvas>
    <div class="label" id="sprite-label">idle</div>
  </div>
</div>

<script>
(function () {
  const ANIMS = [["idle", 0], ["gesture", 1], ["walk", 2], ["attack", 3], ["death", 4]];
  const F = 32;
  const img = new Image();
  img.src = "slime_calciumtrice.png";
  const canvas = document.getElementById("sprite-canvas");
  const ctx = canvas.getContext("2d");
  const animSel = document.getElementById("anim");
  ANIMS.forEach((a, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = a[0];
    animSel.appendChild(o);
  });
  let frame = 0;
  let animIdx = 0;
  let colorIdx = 0;
  function draw() {
    const scale = Number(document.getElementById("sscale").value);
    canvas.width = F * scale; canvas.height = F * scale;
    const row = colorIdx * 5 + ANIMS[animIdx][1];
    const srcX = (frame % 10) * F;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, srcX, row * F, F, F, 0, 0, canvas.width, canvas.height);
    document.getElementById("sprite-label").textContent =
      ANIMS[animIdx][0] + " (color " + (colorIdx + 1) + ")";
  }
  animSel.addEventListener("change", (e) => { animIdx = Number(e.target.value); frame = 0; draw(); });
  document.getElementById("scolor").addEventListener("change", (e) => { colorIdx = Number(e.target.value) - 1; frame = 0; draw(); });
  document.getElementById("sscale").addEventListener("change", draw);
  img.onload = () => {
    setInterval(() => { frame = (frame + 1) % 10; draw(); }, 120);
    draw();
  };
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
fs.writeFileSync(OUT_HTML, html);
console.log("Wrote " + OUT_HTML);

if (fs.existsSync(SHEET_SRC)) {
  fs.copyFileSync(SHEET_SRC, SHEET_DST);
  console.log("Copied sprite sheet to " + SHEET_DST);
}

if (!noOpen) {
  const { spawn } = require("child_process");
  spawn("open", [OUT_HTML], { stdio: "ignore", detached: true }).unref();
}
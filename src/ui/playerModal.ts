import * as THREE from 'three';
import { DEFAULTS } from '../config/defaults';
import { makeModelInstance, MODEL, type ModelInstance } from '../render/three/model';
import { hexCss, SKIN_TONE, SWATCHES, type Look } from '../sim/look';
import { draftProfile, saveProfile, type PlayerProfile } from '../sim/profile';
import { cyclePart, moveNav, PARTS, type NavState, type Part } from './playerNav';

const HOLD_MS = 280;
const REPEAT_MS = 180;
const STICK = 0.55;

export interface PlayerModal {
  open(opts?: { required?: boolean }): void;
  isOpen(): boolean;
}

export function createPlayerModal(opts: { onSave: (profile: PlayerProfile) => void }): PlayerModal {
  const root = document.createElement('div');
  root.id = 'player-modal';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="pm-card" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <h2 id="pm-title">My Player</h2>
      <p class="pm-sub" id="pm-sub"></p>
      <div class="pm-body">
        <div class="pm-stage" data-state="loading">
          <canvas id="pm-canvas"></canvas>
          <div class="pm-fig" hidden>
            <i class="helm"></i><i class="face"></i><b class="jersey">12</b><i class="pants"></i>
          </div>
          <p class="pm-loading">Loading player…</p>
        </div>
        <div class="pm-form">
          <label class="pm-name">Name
            <input id="pm-name" maxlength="16" autocomplete="nickname" spellcheck="false">
          </label>
          <div class="pm-parts" id="pm-parts"></div>
          <div class="pm-grid" id="pm-grid"></div>
          <input id="pm-color" class="pm-color" type="color" tabindex="-1" aria-hidden="true">
          <p class="pm-hint" id="pm-hint"></p>
          <div class="pm-actions">
            <button id="pm-close" type="button" class="ghost">Close</button>
            <button id="pm-save" type="button" class="primary">Save / Play</button>
          </div>
          <p class="pm-padhint">D-pad or arrows move · A or Enter selects · B closes</p>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const openBtn = document.createElement('button');
  openBtn.id = 'my-player';
  openBtn.type = 'button';
  openBtn.textContent = 'My Player';
  document.body.appendChild(openBtn);

  const card = root.querySelector('.pm-card') as HTMLElement;
  const title = byId('pm-title');
  const sub = byId('pm-sub');
  const stage = root.querySelector('.pm-stage') as HTMLElement;
  const canvas = byId('pm-canvas') as HTMLCanvasElement;
  const fig = root.querySelector('.pm-fig') as HTMLElement;
  const loading = root.querySelector('.pm-loading') as HTMLElement;
  const nameInput = byId('pm-name') as HTMLInputElement;
  const partsEl = byId('pm-parts');
  const grid = byId('pm-grid');
  const colorInput = byId('pm-color') as HTMLInputElement;
  const hint = byId('pm-hint');
  const closeBtn = byId('pm-close') as HTMLButtonElement;
  const saveBtn = byId('pm-save') as HTMLButtonElement;

  for (const part of PARTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.part = part;
    btn.textContent = part === 'jersey' ? 'Jersey' : part === 'pants' ? 'Pants' : part === 'helmet' ? 'Helmet' : 'Skin';
    partsEl.appendChild(btn);
  }

  let open = false;
  let required = false;
  let draft = draftProfile();
  let nav: NavState = { region: 'name', part: 'jersey', colorIndex: 0, actionIndex: 1, required: false };
  let raf = 0;
  let last = 0;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let instance: ModelInstance | null = null;
  let ground: THREE.Mesh | null = null;
  let padPrev = blankPad();
  let holdDir = '';
  let nextRepeat = 0;

  function selectedIndex(): number {
    if (nav.part === 'skin') return draft.look.skin === 'dark' ? 1 : 0;
    const current = draft.look[nav.part];
    const found = SWATCHES.indexOf(current);
    return found >= 0 ? found : SWATCHES.length;
  }

  function rebuildColors() {
    grid.innerHTML = '';
    if (nav.part === 'skin') {
      for (const tone of ['light', 'dark'] as const) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pm-swatch pm-skin';
        btn.dataset.skin = tone;
        btn.style.background = hexCss(SKIN_TONE[tone]);
        btn.textContent = tone === 'light' ? 'Light' : 'Dark';
        grid.appendChild(btn);
      }
      return;
    }
    for (const color of SWATCHES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-swatch';
      btn.dataset.color = String(color);
      btn.style.background = hexCss(color);
      btn.title = hexCss(color);
      grid.appendChild(btn);
    }
    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'pm-swatch pm-custom';
    custom.dataset.custom = '1';
    custom.title = 'Custom color';
    custom.appendChild(document.createElement('span'));
    grid.appendChild(custom);
  }

  function paint() {
    title.textContent = required ? 'Create your player' : 'My Player';
    sub.textContent = required
      ? 'Pick a name and a kit. You need this before you play.'
      : 'This name and kit show up on the field and in online rooms.';
    closeBtn.hidden = required;
    const current: number | null = nav.part === 'skin' ? null : draft.look[nav.part];
    partsEl.querySelectorAll('button').forEach((btn) => {
      const el = btn as HTMLButtonElement;
      el.classList.toggle('on', el.dataset.part === nav.part);
      el.classList.toggle('pad-focus', nav.region === 'parts' && el.dataset.part === nav.part);
    });
    grid.querySelectorAll('button').forEach((btn, i) => {
      const el = btn as HTMLButtonElement;
      let on = false;
      if (nav.part === 'skin') on = el.dataset.skin === draft.look.skin;
      else if (el.dataset.custom) on = current != null && !SWATCHES.includes(current);
      else on = Number(el.dataset.color) === current;
      el.classList.toggle('on', on);
      el.classList.toggle('pad-focus', nav.region === 'colors' && i === nav.colorIndex);
      if (el.dataset.custom) {
        const inner = el.querySelector('span') as HTMLElement;
        inner.style.background = on && current != null ? hexCss(current) : '#122016';
      }
    });
    nameInput.classList.toggle('pad-focus', nav.region === 'name');
    closeBtn.classList.toggle('pad-focus', nav.region === 'actions' && !required && nav.actionIndex === 0);
    saveBtn.classList.toggle('pad-focus', nav.region === 'actions' && (required || nav.actionIndex === 1));
    const cloth: Look = draft.look;
    (fig.querySelector('.helm') as HTMLElement).style.background = hexCss(cloth.helmet);
    (fig.querySelector('.face') as HTMLElement).style.background = hexCss(SKIN_TONE[cloth.skin]);
    (fig.querySelector('.jersey') as HTMLElement).style.background = hexCss(cloth.jersey);
    (fig.querySelector('.pants') as HTMLElement).style.background = hexCss(cloth.pants);
    if (nav.part !== 'skin') colorInput.value = hexCss(cloth[nav.part]);
  }

  function applyNav(next: NavState) {
    const partChanged = next.part !== nav.part;
    nav = next;
    if (partChanged) {
      rebuildColors();
      nav.colorIndex = selectedIndex();
    }
    if (nav.region !== 'name' && document.activeElement === nameInput) nameInput.blur();
    paint();
  }

  function nudge(dx: number, dy: number) {
    applyNav(moveNav(nav, dx, dy));
  }

  function applyFocusedColor() {
    const buttons = [...grid.querySelectorAll('button')] as HTMLButtonElement[];
    const btn = buttons[nav.colorIndex];
    if (!btn) return;
    if (btn.dataset.skin) draft.look.skin = btn.dataset.skin === 'dark' ? 'dark' : 'light';
    else if (btn.dataset.custom) colorInput.click();
    else if (btn.dataset.color && nav.part !== 'skin') draft.look[nav.part] = Number(btn.dataset.color);
    paint();
  }

  function activate() {
    if (nav.region === 'name') { nameInput.focus(); return; }
    if (nav.region === 'parts') { applyNav({ ...nav, region: 'colors' }); return; }
    if (nav.region === 'colors') { applyFocusedColor(); return; }
    if (!required && nav.actionIndex === 0) close();
    else commit();
  }

  function commit() {
    const name = nameInput.value;
    if (!name.trim()) {
      hint.textContent = 'Enter a name to play.';
      applyNav({ ...nav, region: 'name' });
      nameInput.focus();
      return;
    }
    let saved: PlayerProfile;
    try {
      saved = saveProfile({ name, look: draft.look });
    } catch (err) {
      hint.textContent = err instanceof Error ? err.message : 'Enter a name to play.';
      nameInput.focus();
      return;
    }
    draft = { name: saved.name, look: { ...saved.look } };
    opts.onSave(saved);
    close(true);
  }

  function show(nextRequired: boolean) {
    if (open) return;
    open = true;
    required = nextRequired;
    draft = draftProfile();
    nameInput.value = draft.name;
    hint.textContent = '';
    nav = {
      region: 'name',
      part: 'jersey',
      colorIndex: 0,
      actionIndex: nextRequired ? 0 : 1,
      required: nextRequired,
    };
    nav.colorIndex = selectedIndex();
    rebuildColors();
    paint();
    root.classList.remove('hidden');
    padPrev = blankPad();
    holdDir = '';
    last = performance.now();
    startPreview();
    nameInput.focus();
  }

  function close(force = false) {
    if (!open || (required && !force)) return;
    open = false;
    required = false;
    root.classList.add('hidden');
    stopPreview();
    nameInput.blur();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    const typing = document.activeElement === nameInput;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!required) close();
      return;
    }
    if (typing && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return;
    if (e.key === 'ArrowUp') nudge(0, -1);
    else if (e.key === 'ArrowDown') nudge(0, 1);
    else if (e.key === 'ArrowLeft') nudge(-1, 0);
    else if (e.key === 'ArrowRight') nudge(1, 0);
    else if (e.key === 'Enter') {
      if (typing || nav.region === 'name') commit();
      else activate();
    } else if (e.key === ' ') activate();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected) || null;
    if (!pad) { padPrev = blankPad(); holdDir = ''; return; }
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const cur = {
      left: pressed(14) || ax < -STICK,
      right: pressed(15) || ax > STICK,
      up: pressed(12) || ay < -STICK,
      down: pressed(13) || ay > STICK,
      a: pressed(0),
      b: pressed(1),
      lb: pressed(4),
      rb: pressed(5),
    };
    const now = performance.now();
    const dirs = ['up', 'down', 'left', 'right'] as const;
    for (const dir of dirs) {
      if (cur[dir] && !padPrev[dir]) {
        holdDir = dir;
        nextRepeat = now + HOLD_MS;
        nudge(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
      }
    }
    if (holdDir && cur[holdDir as 'up']) {
      if (now >= nextRepeat) {
        nextRepeat = now + REPEAT_MS;
        const dir = holdDir;
        nudge(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
      }
    } else holdDir = '';
    if (cur.a && !padPrev.a) activate();
    if (cur.b && !padPrev.b && !required) close();
    if (cur.lb && !padPrev.lb) applyNav(cyclePart(nav, -1));
    if (cur.rb && !padPrev.rb) applyNav(cyclePart(nav, 1));
    padPrev = cur;
  }

  function startPreview() {
    stopPreview();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
    camera.position.set(1.55, 1.2, 3.7);
    camera.lookAt(0, 0.95, 0);
    const hemi = new THREE.HemisphereLight(0xd7f5dc, 0x14261b, 1.2);
    const key = new THREE.DirectionalLight(0xfff4d2, 1.7);
    key.position.set(2.4, 5.5, 3.2);
    const fill = new THREE.DirectionalLight(0x9ecfff, 0.45);
    fill.position.set(-3, 2, -1);
    scene.add(hemi, key, fill);
    ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 48),
      new THREE.MeshStandardMaterial({ color: 0x143024, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
    } catch {
      renderer = null;
      stage.dataset.state = 'fallback';
      fig.hidden = false;
      loading.hidden = true;
    }
    const loop = (now: number) => {
      if (!open) return;
      const dt = Math.min(0.05, (now - last) / 1000) || 0;
      last = now;
      pollPad();
      if (!open) return;
      renderPreview(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function renderPreview(dt: number) {
    if (MODEL.failed || !renderer) {
      stage.dataset.state = 'fallback';
      fig.hidden = false;
      loading.hidden = true;
      return;
    }
    if (!instance && MODEL.ready && MODEL.scene && scene) {
      try {
        instance = makeModelInstance(DEFAULTS);
        scene.add(instance.holder);
        instance.applyLook(draft.look);
        if (instance.walk) instance.walk.timeScale = 0.55;
      } catch {
        stage.dataset.state = 'fallback';
        fig.hidden = false;
        loading.hidden = true;
        return;
      }
    }
    if (!instance || !camera || !scene) {
      stage.dataset.state = 'loading';
      fig.hidden = true;
      loading.hidden = false;
      return;
    }
    stage.dataset.state = 'ready';
    fig.hidden = true;
    loading.hidden = true;
    instance.applyLook(draft.look);
    instance.holder.rotation.y += dt * 0.65;
    instance.mixer?.update(dt);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 2 || h < 2) return;
    if (canvas.width !== Math.floor(w * Math.min(devicePixelRatio || 1, 2))) {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function stopPreview() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (instance && scene) scene.remove(instance.holder);
    if (instance) {
      const mat = instance.sk.material;
      if (!Array.isArray(mat)) mat.dispose();
      instance = null;
    }
    if (ground) {
      ground.geometry.dispose();
      const mat = ground.material;
      if (!Array.isArray(mat)) mat.dispose();
      ground = null;
    }
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
    scene = null;
    camera = null;
  }

  openBtn.addEventListener('click', () => show(false));
  root.addEventListener('click', (e) => { if (e.target === root && !required) close(); });
  card.addEventListener('click', (e) => e.stopPropagation());
  closeBtn.addEventListener('click', () => close());
  saveBtn.addEventListener('click', () => commit());
  nameInput.addEventListener('focus', () => { nav.region = 'name'; paint(); });
  nameInput.addEventListener('input', () => { hint.textContent = ''; });
  partsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    const part = btn?.dataset.part as Part | undefined;
    if (!part) return;
    applyNav({ ...nav, region: 'parts', part });
  });
  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const buttons = [...grid.querySelectorAll('button')];
    nav.colorIndex = Math.max(0, buttons.indexOf(btn));
    nav.region = 'colors';
    applyFocusedColor();
  });
  colorInput.addEventListener('input', () => {
    if (nav.part === 'skin') return;
    draft.look[nav.part] = parseInt(colorInput.value.slice(1), 16);
    paint();
  });
  window.addEventListener('keydown', onKey, true);

  return {
    open(options) { show(!!options?.required); },
    isOpen() { return open; },
  };
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

function blankPad() {
  return { left: false, right: false, up: false, down: false, a: false, b: false, lb: false, rb: false };
}

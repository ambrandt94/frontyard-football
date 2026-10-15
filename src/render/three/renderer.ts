import * as THREE from 'three';
import type { Settings } from '../../config/defaults';
import { CAM_FOV, FIELD_L, FIELD_W, LOS_Y } from '../../config/constants';
import { clamp } from '../../sim/math';
import { angledPose } from '../camera';
import type { Player } from '../../sim/types';
import { aiLook } from '../../sim/look';
import { BULLET_COLOR, LOB_COLOR, PLAYER_COLORS } from '../colors';
import { makeFieldCanvas } from '../field';
import type { FieldRenderer, ViewState } from '../types';
import { buildPixelStadium, CLASSIC_SKY, PIXEL_SKY, type PixelStadium } from './stadium';
import { bodyKey, bodyOf } from './body';
import { makeModelInstance, MODEL, type ModelInstance } from './model';
import { poseModel } from './poses';
import { orientBall, placeHeldBall, poseArms, sheetActor, type ArmPose } from './armIk';

interface PlayerView {
  g: THREE.Group;
  body: THREE.Group;
  capG: THREE.Group;
  team: THREE.Mesh;
  shadow: THREE.Mesh;
  sel: THREE.Mesh;
  reach: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  helmetMat: THREE.MeshStandardMaterial;
  callHand: THREE.Mesh;
  callArm: THREE.Mesh;
  model: ModelInstance | null;
  armPose: ArmPose | null;
  propBall: THREE.Group | null;
}

interface LineHandle {
  line: THREE.Line;
  pts: THREE.Points;
  set(arr: { x: number; y: number; z?: number }[], step?: number): void;
  show(v: boolean): void;
}

type SheetExtra = { pose?: string; speed?: number; boost?: number; lying?: number; lean?: number; z?: number; turn?: number };

const SHEET_POSES: Array<[string, string, SheetExtra?]> = [
  ['stance', 'WR'], ['run', 'WR', { pose: 'run', speed: 7 }], ['sprint', 'WR', { pose: 'sprint', speed: 9.5, boost: 1.5 }], ['squared', 'DF'], ['throwWindup', 'QB'], ['throwRelease', 'QB'],
  ['catchTwo', 'WR'], ['catchOne', 'WR'], ['callHand', 'WR'], ['jump', 'WR', { z: 0.5 }], ['dive', 'WR', { lying: 1 }], ['stretch', 'WR', { lean: 0.6 }],
  ['fall', 'WR', { lean: 1.1 }], ['stiffL', 'RB'], ['stiffR', 'RB'], ['truck', 'RB', { lean: 0.45 }], ['hurdle', 'RB', { z: 0.6 }], ['tackle', 'DF'],
  ['ground', 'DF', { lying: 1 }], ['spin', 'RB', { pose: 'run', speed: 6, turn: 2.2 }], ['carryR', 'RB', { pose: 'carryR' }], ['carryL', 'RB', { pose: 'carryL' }], ['plant', 'WR'],
];

function basic(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
  return mesh.material as THREE.MeshBasicMaterial;
}

export function createThreeRenderer(S: Settings): FieldRenderer {
  let renderer: THREE.WebGLRenderer = null!;
  let scene: THREE.Scene = null!;
  let camera: THREE.PerspectiveCamera = null!;
  let el: HTMLElement = null!;
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const players: Record<string, PlayerView> = {};
  let sheet: PlayerView[] | null = null;
  let sheetLabelList: { text: string; x: number; y: number }[] = [];
  let ball: THREE.Group = null!;
  let ballShadow: THREE.Mesh = null!;
  let arc: LineHandle = null!;
  let preview: LineHandle = null!;
  let ribbon: THREE.Mesh = null!;
  let previewRing: THREE.Mesh = null!;
  let previewFill: THREE.Mesh = null!;
  let beads: THREE.Sprite[] = [];
  let fuzzBlob: THREE.Mesh = null!;
  let fuzzWedge: THREE.Mesh = null!;
  let guide: LineHandle = null!;
  let cutGuide: LineHandle = null!;
  let cutDot: THREE.Mesh = null!;
  let route: LineHandle = null!;
  let reticle: THREE.Group = null!;
  let landing: THREE.Mesh = null!;
  let cue: THREE.Mesh = null!;
  let los: THREE.Mesh = null!;
  let goal: THREE.Mesh = null!;
  let classicApron: THREE.Mesh = null!;
  let classicField: THREE.Mesh = null!;
  let pixelStadium: PixelStadium | null = null;
  let shownField: string | null = null;
  let trails: LineHandle[] = [];
  const ikDots: THREE.Mesh[] = [];
  const ikDotGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const releaseFrom = new THREE.Vector3();
  const releaseFromQ = new THREE.Quaternion();
  const airQuat = new THREE.Quaternion();
  const simBall = new THREE.Vector3();
  let hadHold = false;
  let releaseStart = -1;
  const ikPoints: { x: number; y: number; z: number; color: number }[] = [];

  function makePlayer(color: number): PlayerView {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const capG = new THREE.Group();
    g.add(body);
    body.add(capG);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 16), mat);
    cap.position.y = 0.92;
    capG.add(cap);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), helmetMat);
    helmet.position.y = 1.85;
    capG.add(helmet);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 1.25), mat);
    shoulders.position.y = 1.45;
    capG.add(shoulders);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 12), new THREE.MeshBasicMaterial({ color: 0xffee58 }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.65, 1.9, 0);
    capG.add(nose);
    const team = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    team.rotation.x = -Math.PI / 2;
    team.position.y = 0.025;
    scene.add(team);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9, depthWrite: false }));
    sel.rotation.x = -Math.PI / 2;
    sel.position.y = 0.03;
    const reach = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    reach.rotation.x = -Math.PI / 2;
    reach.position.y = 0.04;
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffcc80 });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.18), armMat);
    armL.position.set(0.35, 1.45, -0.75);
    armL.rotation.y = 0.6;
    body.add(armL);
    const armR = armL.clone();
    armR.position.z = 0.75;
    armR.rotation.y = -0.6;
    body.add(armR);
    const callHand = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffeb3b }));
    callHand.position.set(0, 2.75, 0.35);
    body.add(callHand);
    const callArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), armMat);
    callArm.position.set(0, 2.25, 0.4);
    body.add(callArm);
    scene.add(g, shadow, sel, reach);
    return { g, body, capG, team, shadow, sel, reach, armL, armR, mat, helmetMat, callHand, callArm, model: null, armPose: null, propBall: null };
  }

  function propFootball(): THREE.Group {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8d4b1f, roughness: 0.5 }));
    mesh.scale.set(0.42, 0.26, 0.26);
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lace.position.y = 0.13;
    const g = new THREE.Group();
    g.add(mesh, lace);
    scene.add(g);
    return g;
  }

  function drawIk(points: { x: number; y: number; z: number; color: number }[]) {
    const on = S.armIkDebug && S.armIk;
    while (ikDots.length < points.length) {
      const m = new THREE.Mesh(ikDotGeo, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.95 }));
      m.renderOrder = 12;
      m.frustumCulled = false;
      scene.add(m);
      ikDots.push(m);
    }
    for (let i = 0; i < ikDots.length; i++) {
      const p = points[i];
      ikDots[i].visible = on && !!p;
      if (!p) continue;
      ikDots[i].position.set(p.x, p.y, p.z);
      basic(ikDots[i]).color.setHex(p.color);
    }
  }

  function makeLine(color: number, n = 512, opacity = 1): LineHandle {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.28, transparent: true, opacity }));
    line.frustumCulled = pts.frustumCulled = false;
    scene.add(line, pts);
    return {
      line, pts,
      set(arr, step = 1) {
        const attr = geo.attributes.position as THREE.BufferAttribute;
        const a = attr.array as Float32Array;
        let k = 0;
        for (let i = 0; i < arr.length && k < n; i += step, k++) {
          a[k * 3] = arr[i].x;
          a[k * 3 + 1] = (arr[i].z || 0) + 0.05;
          a[k * 3 + 2] = -arr[i].y;
        }
        geo.setDrawRange(0, k);
        attr.needsUpdate = true;
      },
      show(v) { line.visible = pts.visible = v; },
    };
  }

  const loftBlue = new THREE.Color(LOB_COLOR);
  const bulletOrange = new THREE.Color(BULLET_COLOR);
  const loftMix = new THREE.Color();

  function makeRibbon(): THREE.Mesh {
    const segments = 32;
    const verts = (segments + 1) * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    const index = new Uint16Array(segments * 6);
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const o = i * 6;
      index[o] = a;
      index[o + 1] = a + 1;
      index[o + 2] = a + 2;
      index[o + 3] = a + 1;
      index[o + 4] = a + 3;
      index[o + 5] = a + 2;
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 2;
    const g = canvas.getContext('2d');
    if (g) {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.62, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 2);
    }
    const map = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  function updateRibbon(points: { x: number; y: number; z?: number }[], loft: number, widthScale: number, opacity: number) {
    const geo = ribbon.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    const ua = uv.array as Float32Array;
    const n = Math.min(points.length, 33);
    loftMix.copy(loftBlue).lerp(bulletOrange, Math.max(0, Math.min(1, loft)));
    for (let i = 0; i < n; i++) {
      const p = points[Math.min(points.length - 1, Math.round(i * (points.length - 1) / Math.max(1, n - 1)))];
      const q = points[Math.min(points.length - 1, Math.round((i + 1) * (points.length - 1) / Math.max(1, n - 1)))];
      let tx = q.x - p.x;
      let tz = -(q.y - p.y);
      if (i === n - 1 && i > 0) {
        const prev = points[Math.min(points.length - 1, Math.round((i - 1) * (points.length - 1) / Math.max(1, n - 1)))];
        tx = p.x - prev.x;
        tz = -(p.y - prev.y);
      }
      const len = Math.hypot(tx, tz) || 1;
      const t = n <= 1 ? 0 : i / (n - 1);
      const w = 0.55 * widthScale * (1 - t * 0.82);
      const px = (-tz / len) * w;
      const pz = (tx / len) * w;
      const y = (p.z || 0) + 0.12;
      const o = i * 2;
      pa[(o) * 3] = p.x + px;
      pa[(o) * 3 + 1] = y;
      pa[(o) * 3 + 2] = -p.y + pz;
      pa[(o + 1) * 3] = p.x - px;
      pa[(o + 1) * 3 + 1] = y;
      pa[(o + 1) * 3 + 2] = -p.y - pz;
      for (const k of [o, o + 1]) {
        ca[k * 3] = loftMix.r;
        ca[k * 3 + 1] = loftMix.g;
        ca[k * 3 + 2] = loftMix.b;
        ua[k * 2] = t;
        ua[k * 2 + 1] = k === o ? 0 : 1;
      }
    }
    geo.setDrawRange(0, Math.max(0, n - 1) * 6);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    uv.needsUpdate = true;
    basic(ribbon).opacity = opacity;
  }

  function softDisc(inner: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, inner, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function samplesAlong(points: { x: number; y: number; z?: number }[], spacing: number) {
    const out: { x: number; y: number; z: number; t: number }[] = [];
    if (points.length < 2) return out;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, (points[i].z || 0) - (points[i - 1].z || 0));
    }
    total = Math.max(total, 0.001);
    out.push({ x: points[0].x, y: points[0].y, z: points[0].z || 0, t: 0 });
    let carry = 0;
    let walked = 0;
    for (let i = 1; i < points.length && out.length < beads.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = (b.z || 0) - (a.z || 0);
      const seg = Math.hypot(dx, dy, dz) || 0.0001;
      let done = 0;
      while (done < seg && out.length < beads.length) {
        const need = spacing - carry;
        if (done + need <= seg + 1e-4) {
          const u = (done + need) / seg;
          walked += need;
          out.push({
            x: a.x + dx * u,
            y: a.y + dy * u,
            z: (a.z || 0) + dz * u,
            t: Math.min(1, walked / total),
          });
          done += need;
          carry = 0;
        } else {
          carry += seg - done;
          walked += seg - done;
          break;
        }
      }
    }
    return out;
  }

  function updateBeads(points: { x: number; y: number; z?: number }[], loft: number, widthScale: number, opacity: number) {
    const spots = samplesAlong(points, 1.75);
    loftMix.copy(loftBlue).lerp(bulletOrange, Math.max(0, Math.min(1, loft)));
    const diam = 1.1 * widthScale;
    for (let i = 0; i < beads.length; i++) {
      const bead = beads[i];
      const spot = spots[i];
      if (!spot) { bead.visible = false; continue; }
      bead.visible = true;
      bead.position.set(spot.x, spot.z + 0.16, -spot.y);
      const shrink = 1 - spot.t * 0.4;
      bead.scale.setScalar(Math.max(0.08, diam * shrink));
      const mat = bead.material as THREE.SpriteMaterial;
      mat.color.copy(loftMix);
      mat.opacity = opacity * (1 - spot.t * 0.9);
    }
  }

  function updateFuzz(fuzz: ViewState['aimFuzz']) {
    fuzzBlob.visible = !!fuzz;
    fuzzWedge.visible = !!fuzz;
    if (!fuzz) return;
    fuzzBlob.position.set(fuzz.x, 0.05, -fuzz.y);
    fuzzBlob.scale.set(fuzz.radius, fuzz.radius, 1);
    basic(fuzzBlob).color.setHex(fuzz.color);
    const pos = (fuzzWedge.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const fx = fuzz.fromX;
    const fz = -fuzz.fromY;
    const bx = fuzz.x;
    const bz = -fuzz.y;
    const dx = bx - fx;
    const dz = bz - fz;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * fuzz.radius * 0.42;
    const pz = (dx / len) * fuzz.radius * 0.42;
    const y = 0.04;
    a[0] = fx + dx * 0.08; a[1] = y; a[2] = fz + dz * 0.08;
    a[3] = bx + px; a[4] = y; a[5] = bz + pz;
    a[6] = bx - px; a[7] = y; a[8] = bz - pz;
    pos.needsUpdate = true;
    fuzzWedge.geometry.computeBoundingSphere();
    basic(fuzzWedge).color.setHex(fuzz.color);
  }

  function syncSheet(view: ViewState) {
    const on = !!view.poseSheet && MODEL.ready;
    if (!sheet && on) {
      sheet = SHEET_POSES.map(([, role]) => {
        const v = makePlayer(PLAYER_COLORS[role] || 0xcccccc);
        const kit = aiLook(role, []);
        v.model = makeModelInstance(S, kit);
        v.model.applyLook(kit);
        v.body.add(v.model.holder);
        v.capG.visible = false;
        [v.armL, v.armR, v.callHand, v.callArm, v.sel, v.reach].forEach((m) => { m.visible = false; });
        return v;
      });
    }
    if (!sheet) return;
    sheetLabelList = [];
    SHEET_POSES.forEach(([name, role, extra], i) => {
      const v = sheet![i];
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 14 + col * 5;
      const y = 64 - row * 5.5;
      v.g.visible = v.shadow.visible = v.team.visible = on;
      if (!on || !v.model) {
        if (v.propBall) v.propBall.visible = false;
        return;
      }
      const p = {
        x, y, z: 0, vx: 0, vy: 0, role, facing: -Math.PI / 2 + ((extra && extra.turn) || 0),
        forcePose: (extra && extra.pose) || name, forceSpeed: extra && extra.speed, forcePhase: 1.3,
        boost: (extra && extra.boost) || 0, groundT: 0, diveT: -1,
      } as Player;
      v.g.position.set(x, (extra && extra.z) || 0, -y);
      v.g.rotation.y = p.facing;
      v.g.scale.setScalar(1.4);
      const lying = extra && extra.lying ? 1 : 0;
      const lean = (extra && extra.lean) || 0;
      v.body.rotation.z = -Math.max(lying * Math.PI / 2 * 0.95, lean);
      v.body.position.y = lying * 0.45;
      v.shadow.position.set(x, 0.02, -y);
      v.team.position.set(x, 0.025, -y);
      basic(v.team).color.setHex(aiLook(role, []).jersey);
      v.model.ol.visible = S.modelOutline;
      poseModel(v.model, p, { t: 0, ball: { holder: null, state: 'held', throwT: 0 }, mode: 'sheet' }, view);
      const posed = (extra && extra.pose) || name;
      if (S.armIk) {
        const act = sheetActor(posed, x, y, p.facing);
        v.armPose = poseArms(v.model, act.player, { t: 0.05, mode: 'sheet', ball: act.ball, players: act.players }, { charge: false, snap: true, tune: S });
        if (!v.propBall) v.propBall = propFootball();
        const held = v.armPose.anchor ? placeHeldBall(v.model, v.armPose.anchor) : null;
        const mark = held ? held.pos : v.armPose.air;
        v.propBall.visible = !!mark;
        if (mark) {
          v.propBall.position.set(mark.x, mark.y, mark.z);
          if (held && v.armPose.anchor) orientBall(v.armPose.anchor.kind, held, v.propBall.quaternion);
        }
        if (v.armPose.debug.length) ikPoints.push(...v.armPose.debug);
      } else if (v.propBall) v.propBall.visible = false;
      sheetLabelList.push({ text: name, x, y: y - 1.6 });
    });
    if (on) {
      const cx = 14 + 2.5 * 5;
      const cy = 64 - 1.5 * 5.5;
      camera.up.set(0, 1, 0);
      camera.position.set(cx, 34, -(cy - 24));
      camera.lookAt(cx, 0.5, -cy);
    }
  }

  function placeCamera(view: ViewState) {
    const c = view.cam;
    const angled = !!c.rig && c.rig !== 'topdown';
    if (!angled) {
      camera.up.set(0, 0, -1);
      camera.fov = CAM_FOV;
      camera.position.set(c.x, c.h, -c.y);
      camera.lookAt(c.x, 0, -c.y);
      camera.near = 1;
      camera.far = 400;
    } else {
      camera.fov = c.fov > 1 ? c.fov : CAM_FOV;
      const pose = angledPose(c.lookX, c.lookY, Math.max(12, c.dist), c.pitch, c.azimuth);
      camera.up.set(0, 1, 0);
      camera.position.set(pose.px, pose.py, pose.pz);
      camera.lookAt(pose.lx, pose.ly, pose.lz);
      camera.near = 0.5;
      camera.far = 900;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function applyFieldStyle() {
    const pixel = S.fieldStyle !== 'classic';
    if (shownField === (pixel ? 'pixel' : 'classic')) return;
    shownField = pixel ? 'pixel' : 'classic';
    classicApron.visible = !pixel;
    classicField.visible = !pixel;
    if (pixelStadium) pixelStadium.group.visible = pixel;
    const sky = scene.background;
    if (sky instanceof THREE.Color) sky.setHex(pixel ? PIXEL_SKY : CLASSIC_SKY);
  }

  const api: FieldRenderer = {
    name: 'three',
    init(container) {
      el = container;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      el.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(PIXEL_SKY);
      camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 400);
      camera.up.set(0, 0, -1);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x335533, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-20, 60, 25);
      scene.add(sun);
      classicApron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W + 24, FIELD_L + 24), new THREE.MeshStandardMaterial({ color: 0x1f5a26 }));
      classicApron.rotation.x = -Math.PI / 2;
      classicApron.position.set(FIELD_W / 2, -0.02, -FIELD_L / 2);
      scene.add(classicApron);
      const tex = new THREE.CanvasTexture(makeFieldCanvas(20));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      classicField = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      classicField.rotation.x = -Math.PI / 2;
      classicField.position.set(FIELD_W / 2, 0, -FIELD_L / 2);
      scene.add(classicField);
      pixelStadium = buildPixelStadium();
      scene.add(pixelStadium.group);
      applyFieldStyle();
      los = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.3), new THREE.MeshBasicMaterial({ color: 0x40a9ff }));
      los.rotation.x = -Math.PI / 2;
      los.position.set(FIELD_W / 2, 0.015, -LOS_Y);
      scene.add(los);
      goal = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.45), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
      goal.rotation.x = -Math.PI / 2;
      goal.position.set(FIELD_W / 2, 0.016, -110);
      scene.add(goal);
      const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), new THREE.MeshStandardMaterial({ color: 0x8d4b1f, roughness: 0.5 }));
      ballMesh.scale.set(0.42, 0.26, 0.26);
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lace.position.y = 0.13;
      ball = new THREE.Group();
      ball.add(ballMesh, lace);
      scene.add(ball);
      ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.5, depthWrite: false }));
      ballShadow.rotation.x = -Math.PI / 2;
      scene.add(ballShadow);
      arc = makeLine(0xfff59d, 512, 0.9);
      preview = makeLine(0x80deea, 512, 0.75);
      preview.show(false);
      ribbon = makeRibbon();
      scene.add(ribbon);
      guide = makeLine(0xffffff, 2, 0.35);
      cutGuide = makeLine(0xffd54a, 2, 0.95);
      route = makeLine(0xffffff, 16, 0.35);
      const mk = (geo: THREE.BufferGeometry, color: number, op = 0.95) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        scene.add(m);
        return m;
      };
      cutDot = mk(new THREE.CircleGeometry(0.28, 18), 0xffd54a, 0.95);
      cutDot.visible = false;
      reticle = new THREE.Group();
      const r1 = mk(new THREE.RingGeometry(0.85, 1.05, 40), 0xffeb3b);
      const r2 = mk(new THREE.PlaneGeometry(2.6, 0.12), 0xffeb3b);
      const r3 = mk(new THREE.PlaneGeometry(0.12, 2.6), 0xffeb3b);
      reticle.add(r1, r2, r3);
      reticle.frustumCulled = false;
      reticle.traverse((obj) => { obj.frustumCulled = false; });
      scene.add(reticle);
      landing = mk(new THREE.RingGeometry(0.5, 0.75, 32), 0xff7043);
      landing.frustumCulled = false;
      previewRing = mk(new THREE.RingGeometry(0.88, 1, 48), LOB_COLOR, 0.55);
      previewRing.frustumCulled = false;
      previewRing.visible = false;
      previewFill = mk(new THREE.CircleGeometry(0.72, 32), LOB_COLOR, 0.1);
      previewFill.frustumCulled = false;
      previewFill.visible = false;
      const disc = softDisc(6);
      beads = [];
      for (let i = 0; i < 28; i++) {
        const bead = new THREE.Sprite(new THREE.SpriteMaterial({
          map: disc, color: LOB_COLOR, transparent: true, opacity: 0.5, depthWrite: false,
        }));
        bead.visible = false;
        bead.frustumCulled = false;
        bead.renderOrder = 3;
        scene.add(bead);
        beads.push(bead);
      }
      const blobTex = softDisc(2);
      fuzzBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({
        map: blobTex, color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false,
      }));
      fuzzBlob.rotation.x = -Math.PI / 2;
      fuzzBlob.frustumCulled = false;
      fuzzBlob.visible = false;
      fuzzBlob.renderOrder = 1;
      scene.add(fuzzBlob);
      const wedgeGeo = new THREE.BufferGeometry();
      wedgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      fuzzWedge = new THREE.Mesh(wedgeGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide,
      }));
      fuzzWedge.frustumCulled = false;
      fuzzWedge.visible = false;
      fuzzWedge.renderOrder = 1;
      scene.add(fuzzWedge);
      cue = mk(new THREE.RingGeometry(0.88, 1.0, 48), 0xffeb3b);
      api.resize();
    },
    resize() {
      const w = el.clientWidth || innerWidth;
      const h = el.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    sync(st, view) {
      ikPoints.length = 0;
      placeCamera(view);
      applyFieldStyle();
      if (pixelStadium && shownField === 'pixel') pixelStadium.fade(camera.position.x);
      syncSheet(view);
      los.visible = st.mode === 'throw' || st.mode === 'coverage';
      const goalY = st.carry?.goalY ?? 110;
      goal.visible = st.mode === 'run' || !!st.carry;
      goal.position.set(FIELD_W / 2, 0.016, -goalY);
      cue.visible = !!view.cue;
      if (view.cue) {
        const r = 1 + 2.5 * (1 - view.cue.frac);
        cue.position.set(view.cue.x, 0.06, -view.cue.y);
        cue.scale.set(r, r, r);
        basic(cue).opacity = 0.5 + 0.5 * view.cue.frac;
      }
      for (const id in players) {
        const here = !!st.players[id] && !view.poseSheet;
        const v = players[id];
        v.g.visible = v.shadow.visible = v.team.visible = here;
        if (!here) { v.sel.visible = v.reach.visible = false; }
      }
      const useModel = MODEL.ready && S.playerVisuals === 'model';
      for (const id in st.players) {
        const p = st.players[id];
        const v = players[id] || (players[id] = makePlayer(PLAYER_COLORS[p.role] || 0xcccccc));
        v.g.position.set(p.x, p.z, -p.y);
        v.g.rotation.y = p.facing + (p.spinVis || 0);
        v.armL.visible = p.stiffArm === 'L';
        v.armR.visible = p.stiffArm === 'R';
        v.callHand.visible = v.callArm.visible = p.callT != null && st.t - p.callT < 0.9;
        const look = p.look ?? aiLook(p.role, []);
        const nextKey = bodyKey(bodyOf(look, S.modelHeightYd));
        if (v.model && v.model.bodyKey !== nextKey) {
          v.body.remove(v.model.holder);
          v.model.dispose();
          v.model = null;
        }
        if (useModel && !v.model) {
          v.model = makeModelInstance(S, look);
          v.body.add(v.model.holder);
        }
        if (v.model) {
          v.model.holder.visible = useModel;
          v.model.applyLook(look);
        }
        v.capG.visible = !useModel;
        if (useModel && v.model) {
          v.armL.visible = v.armR.visible = v.callHand.visible = v.callArm.visible = false;
          v.model.ol.visible = S.modelOutline;
          poseModel(v.model, p, st, view);
        }
        v.team.visible = !view.poseSheet;
        v.team.position.set(p.x, 0.025, -p.y);
        const jersey = look.jersey;
        basic(v.team).color.setHex(p.tint ?? jersey);
        v.mat.color.setHex(jersey);
        v.helmetMat.color.setHex(look.helmet);
        v.team.scale.setScalar(S.playerScale);
        v.g.scale.setScalar(S.playerScale);
        v.shadow.scale.setScalar(S.playerScale);
        const lying = p.diveT >= 0 ? Math.min(1, p.diveT / (S.diveDuration * 0.6)) : p.groundT > 0 ? clamp(p.groundT / 0.5, 0, 1) : 0;
        const lean = p.move && p.move.type === 'truck' ? 0.45 : (p.stretch || 0) * 0.6 + (p.planted && p.planted.falling ? 0.5 : 0);
        v.body.rotation.z = -Math.max(lying * Math.PI / 2 * 0.95, lean);
        v.body.position.y = lying * 0.45;
        if (S.armIk && useModel && v.model && v.model.holder.visible && !view.poseSheet) {
          v.armPose = poseArms(v.model, p, st, { charge: view.qbCharge != null && st.ball.holder === p.id, tune: S });
          if (v.armPose.debug.length) ikPoints.push(...v.armPose.debug);
        } else v.armPose = null;
        v.shadow.position.set(p.x, 0.02, -p.y);
        const ss = (1 - p.z * 0.3) * S.playerScale;
        v.shadow.scale.set(ss, ss, ss);
        v.sel.visible = st.controlled === id;
        v.sel.position.set(p.x, 0.03, -p.y);
        const showR = view.showReach && (id === 'wr' || id === 'df');
        v.reach.visible = showR;
        if (showR && id === 'df') {
          const tk = p.tackle;
          const r = tk && tk.kind === 'dive' ? S.diveTackleReach : S.wrapReach;
          v.reach.position.set(p.x, 0.04, -p.y);
          v.reach.scale.set(r, r, r);
          basic(v.reach).color.set(tk ? 0xff5252 : p.squared ? 0xffab40 : 0xffffff);
          basic(v.reach).opacity = tk ? 0.95 : p.squared ? 0.6 : 0.25;
        } else if (showR) {
          const a = p.attempt;
          const r = a ? a.radius : S.catchReach;
          const hx = p.handX ?? p.x + Math.cos(p.facing) * 0.3;
          const hy = p.handY ?? p.y + Math.sin(p.facing) * 0.3;
          v.reach.position.set(hx, 0.04, -hy);
          v.reach.scale.set(r, r, r);
          basic(v.reach).color.set(a ? (a.type === 'bat' ? 0xffab40 : a.type === 'one' ? 0xe040fb : 0x69f0ae) : 0xffffff);
          basic(v.reach).opacity = a ? 0.95 : 0.3;
        }
      }
      const b = st.ball;
      simBall.set(b.x, b.z, -b.y);
      const holder = b.state === 'held' && b.holder ? players[b.holder] : undefined;
      const anchored = !!(S.armIk && holder?.armPose?.anchor && holder.model && holder.model.holder.visible);
      const held = anchored && holder?.armPose?.anchor && holder.model ? placeHeldBall(holder.model, holder.armPose.anchor) : null;
      if (held && holder?.armPose?.anchor) {
        ball.position.set(held.pos.x, held.pos.y, held.pos.z);
        orientBall(holder.armPose.anchor.kind, held, ball.quaternion);
        releaseFrom.copy(ball.position);
        releaseFromQ.copy(ball.quaternion);
        hadHold = true;
        releaseStart = -1;
        if (S.armIkDebug) ikPoints.push({ x: held.pos.x, y: held.pos.y, z: held.pos.z, color: 0xffee58 });
      } else if (hadHold && b.state === 'air') {
        if (releaseStart < 0) releaseStart = st.t;
        const u = clamp((st.t - releaseStart) / 0.12, 0, 1);
        const s = u * u * (3 - 2 * u);
        ball.position.lerpVectors(releaseFrom, simBall, s);
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (sp > 0.5) {
          const d = new THREE.Vector3(b.vx, b.vz, -b.vy).normalize();
          airQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
          ball.quaternion.copy(releaseFromQ).slerp(airQuat, s);
        }
        if (u >= 1) hadHold = false;
      } else {
        ball.position.copy(simBall);
        hadHold = false;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (sp > 0.5) {
          const d = new THREE.Vector3(b.vx, b.vz, -b.vy).normalize();
          ball.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
        }
      }
      const hs = 1 + b.z * 0.05;
      ball.scale.set(hs, hs, hs);
      ballShadow.position.set(b.x, 0.025, -b.y);
      const bs = 1 + b.z * 0.08;
      ballShadow.scale.set(bs, bs, bs);
      basic(ballShadow).opacity = clamp(0.55 - b.z * 0.03, 0.15, 0.55);
      const inAir = b.state === 'air';
      arc.show(view.showArc && inAir);
      if (inAir) arc.set(b.arc, 2);
      landing.visible = inAir && !!b.landing;
      if (b.landing) landing.position.set(b.landing.x, 0.05, -b.landing.y);
      const showPreview = !!view.preview && view.preview.length > 1;
      const widthScale = Math.max(0.05, view.arcWidth || 0.35);
      const arcOpacity = Math.max(0, Math.min(1, view.arcOpacity ?? 0.5));
      const dotted = view.arcStyle !== 'line';
      ribbon.visible = showPreview && !dotted;
      if (showPreview && view.preview && !dotted) updateRibbon(view.preview, view.previewLoft || 0, widthScale, arcOpacity);
      if (showPreview && view.preview && dotted) updateBeads(view.preview, view.previewLoft || 0, widthScale, arcOpacity);
      else for (const bead of beads) bead.visible = false;
      previewRing.visible = !!view.previewRing;
      previewFill.visible = !!view.previewRing;
      if (view.previewRing) {
        const ringR = Math.max(0.2, view.previewRing.r);
        previewRing.position.set(view.previewRing.x, 0.07, -view.previewRing.y);
        previewFill.position.set(view.previewRing.x, 0.06, -view.previewRing.y);
        previewRing.scale.setScalar(ringR);
        previewFill.scale.setScalar(ringR);
        loftMix.copy(loftBlue).lerp(bulletOrange, Math.max(0, Math.min(1, view.previewLoft || 0)));
        basic(previewRing).color.copy(loftMix);
        basic(previewFill).color.copy(loftMix);
        basic(previewRing).opacity = Math.min(0.72, arcOpacity * 0.9);
        basic(previewFill).opacity = arcOpacity * 0.16;
      }
      updateFuzz(view.aimFuzz);
      guide.show(!!view.aimGuide);
      if (view.aimGuide) guide.set([{ x: view.aimGuide.x, y: view.aimGuide.y }, { x: view.aimGuide.x2, y: view.aimGuide.y2 }], 1);
      cutGuide.show(!!view.cutAim);
      cutDot.visible = !!view.cutAim;
      if (view.cutAim) {
        cutGuide.set([{ x: view.cutAim.x, y: view.cutAim.y }, { x: view.cutAim.x2, y: view.cutAim.y2 }], 1);
        cutDot.position.set(view.cutAim.x2, 0.08, -view.cutAim.y2);
      }
      reticle.visible = !!view.reticle;
      if (view.reticle) reticle.position.set(view.reticle.x, 0.06, -view.reticle.y);
      route.show(!!view.route);
      if (view.route) route.set(view.route);
      view.trails.forEach((tr, i) => {
        const L = trails[i] || (trails[i] = makeLine(0xffffff, 400, 0.55));
        (L.line.material as THREE.LineBasicMaterial).color.setHex(tr.color);
        (L.pts.material as THREE.PointsMaterial).color.setHex(tr.color);
        L.show(true);
        L.set(tr.pts);
      });
      for (let i = view.trails.length; i < trails.length; i++) trails[i].show(false);
      drawIk(ikPoints);
    },
    render() { renderer.render(scene, camera); },
    fieldToScreen(x, y, z = 0) {
      const v = new THREE.Vector3(x, z, -y).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    },
    screenToField(cx, cy) {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x, y: -hit.z };
    },
    sheetLabels() { return sheetLabelList; },
    dispose() { renderer.dispose(); renderer.domElement.remove(); },
  };
  return api;
}

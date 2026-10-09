import * as THREE from 'three';
import type { Settings } from '../../config/defaults';
import { CAM_FOV, FIELD_L, FIELD_W, LOS_Y } from '../../config/constants';
import { clamp } from '../../sim/math';
import type { Player } from '../../sim/types';
import { PLAYER_COLORS } from '../colors';
import { makeFieldCanvas } from '../field';
import type { FieldRenderer, ViewState } from '../types';
import { makeModelInstance, MODEL, type ModelInstance } from './model';
import { poseModel } from './poses';

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
  callHand: THREE.Mesh;
  callArm: THREE.Mesh;
  model: ModelInstance | null;
  modelRole: string | null;
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
  ['ground', 'DF', { lying: 1 }], ['spin', 'RB', { pose: 'run', speed: 6, turn: 2.2 }], ['carryR', 'RB', { pose: 'carryR' }], ['plant', 'WR'],
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
  let route: LineHandle = null!;
  let reticle: THREE.Group = null!;
  let landing: THREE.Mesh = null!;
  let cue: THREE.Mesh = null!;
  let los: THREE.Mesh = null!;
  let goal: THREE.Mesh = null!;
  let trails: LineHandle[] = [];

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
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }));
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
    return { g, body, capG, team, shadow, sel, reach, armL, armR, mat, callHand, callArm, model: null, modelRole: null };
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

  function syncSheet(view: ViewState) {
    const on = !!view.poseSheet && MODEL.ready;
    if (!sheet && on) {
      sheet = SHEET_POSES.map(([, role]) => {
        const v = makePlayer(PLAYER_COLORS[role] || 0xcccccc);
        v.model = makeModelInstance(role, S);
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
      if (!on || !v.model) return;
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
      basic(v.team).color.setHex(PLAYER_COLORS[role] || 0xcccccc);
      v.model.ol.visible = S.modelOutline;
      poseModel(v.model, p, { t: 0, ball: { holder: null, state: 'held', throwT: 0 }, mode: 'sheet' }, view);
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

  const api: FieldRenderer = {
    name: 'three',
    init(container) {
      el = container;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      el.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x10301a);
      camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 400);
      camera.up.set(0, 0, -1);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x335533, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-20, 60, 25);
      scene.add(sun);
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W + 24, FIELD_L + 24), new THREE.MeshStandardMaterial({ color: 0x1f5a26 }));
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(FIELD_W / 2, -0.02, -FIELD_L / 2);
      scene.add(apron);
      const tex = new THREE.CanvasTexture(makeFieldCanvas(20));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      field.rotation.x = -Math.PI / 2;
      field.position.set(FIELD_W / 2, 0, -FIELD_L / 2);
      scene.add(field);
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
      route = makeLine(0xffffff, 16, 0.35);
      const mk = (geo: THREE.BufferGeometry, color: number, op = 0.95) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        scene.add(m);
        return m;
      };
      reticle = new THREE.Group();
      const r1 = mk(new THREE.RingGeometry(0.85, 1.05, 40), 0xffeb3b);
      const r2 = mk(new THREE.PlaneGeometry(2.6, 0.12), 0xffeb3b);
      const r3 = mk(new THREE.PlaneGeometry(0.12, 2.6), 0xffeb3b);
      reticle.add(r1, r2, r3);
      scene.add(reticle);
      landing = mk(new THREE.RingGeometry(0.5, 0.75, 32), 0xff7043);
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
      camera.up.set(0, 0, -1);
      camera.position.set(view.cam.x, view.cam.h, -view.cam.y);
      camera.lookAt(view.cam.x, 0, -view.cam.y);
      syncSheet(view);
      los.visible = st.mode === 'throw';
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
        const wantRole = p.role === 'DF' ? 'DF' : 'O';
        if (useModel && (!v.model || v.modelRole !== wantRole)) {
          if (v.model) v.body.remove(v.model.holder);
          v.model = makeModelInstance(p.role, S);
          v.modelRole = wantRole;
          v.body.add(v.model.holder);
        }
        if (v.model) v.model.holder.visible = useModel;
        v.capG.visible = !useModel;
        if (useModel && v.model) {
          v.armL.visible = v.armR.visible = v.callHand.visible = v.callArm.visible = false;
          v.model.ol.visible = S.modelOutline;
          poseModel(v.model, p, st, view);
        }
        v.team.visible = !view.poseSheet;
        v.team.position.set(p.x, 0.025, -p.y);
        basic(v.team).color.setHex(PLAYER_COLORS[p.role] || 0xcccccc);
        v.mat.color.setHex(PLAYER_COLORS[p.role] || 0xcccccc);
        v.team.scale.setScalar(S.playerScale);
        v.g.scale.setScalar(S.playerScale);
        v.shadow.scale.setScalar(S.playerScale);
        const lying = p.diveT >= 0 ? Math.min(1, p.diveT / (S.diveDuration * 0.6)) : p.groundT > 0 ? 1 : 0;
        const lean = p.move && p.move.type === 'truck' ? 0.45 : (p.stretch || 0) * 0.6 + (p.planted && p.planted.falling ? 0.5 : 0);
        v.body.rotation.z = -Math.max(lying * Math.PI / 2 * 0.95, lean);
        v.body.position.y = lying * 0.45;
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
      ball.position.set(b.x, b.z, -b.y);
      const hs = 1 + b.z * 0.05;
      ball.scale.set(hs, hs, hs);
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > 0.5) {
        const d = new THREE.Vector3(b.vx, b.vz, -b.vy).normalize();
        ball.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
      }
      ballShadow.position.set(b.x, 0.025, -b.y);
      const bs = 1 + b.z * 0.08;
      ballShadow.scale.set(bs, bs, bs);
      basic(ballShadow).opacity = clamp(0.55 - b.z * 0.03, 0.15, 0.55);
      const inAir = b.state === 'air';
      arc.show(view.showArc && inAir);
      if (inAir) arc.set(b.arc, 2);
      landing.visible = inAir && !!b.landing;
      if (b.landing) landing.position.set(b.landing.x, 0.05, -b.landing.y);
      preview.show(!!view.preview);
      if (view.preview) preview.set(view.preview, 2);
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

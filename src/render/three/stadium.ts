import * as THREE from 'three';
import { FIELD_L, FIELD_W } from '../../config/constants';
import { bitmapCanvas, paintCrowd, paintTile, pixelFieldCanvas } from '../pixelField';

/**
 * How much of a sideline stand to keep. The All-22 camera sits inside the
 * field width, so both stands stay. A camera that walks outside a sideline
 * fades the stand that would sit between it and the grass.
 */
export function sidelineFade(cameraX: number): { left: number; right: number } {
  const left = cameraX >= -0.5 ? 1 : Math.max(0, Math.min(1, 1 + (cameraX + 0.5) / 16));
  const right = cameraX <= FIELD_W + 0.5 ? 1 : Math.max(0, Math.min(1, 1 - (cameraX - FIELD_W - 0.5) / 16));
  return { left, right };
}

interface Geo {
  pos: number[];
  uv: number[];
  idx: number[];
}

function quad(g: Geo, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, au: number, av: number, bu: number, bv: number, cu: number, cv: number, du: number, dv: number) {
  const base = g.pos.length / 3;
  g.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
  g.uv.push(au, av, bu, bv, cu, cv, du, dv);
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Box in world yards. UVs are yards, so a repeating texture tiles at `tile`. */
function addBox(g: Geo, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tileU: number, tileV: number) {
  const u = (n: number) => n / tileU;
  const v = (n: number) => n / tileV;
  quad(g, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, u(z0), v(x0), u(z0), v(x1), u(z1), v(x1), u(z1), v(x0));
  quad(g, x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0, u(z1), v(x1), u(z0), v(x1), u(z0), v(x0), u(z1), v(x0));
  quad(g, x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, u(z1), v(y0), u(z0), v(y0), u(z0), v(y1), u(z1), v(y1));
  quad(g, x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, u(z0), v(y0), u(z1), v(y0), u(z1), v(y1), u(z0), v(y1));
  quad(g, x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, u(x0), v(y0), u(x1), v(y0), u(x1), v(y1), u(x0), v(y1));
  quad(g, x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1, u(x1), v(y0), u(x0), v(y0), u(x0), v(y1), u(x1), v(y1));
}

function meshFrom(g: Geo, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setIndex(g.idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = true;
  return mesh;
}

function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function basic(canvas: HTMLCanvasElement, transparent = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: pixelTexture(canvas),
    side: THREE.DoubleSide,
    transparent,
    alphaTest: transparent ? 0.5 : 0,
  });
}

function setOpacity(mats: THREE.MeshBasicMaterial[], opacity: number) {
  const shown = opacity > 0.04;
  for (const mat of mats) {
    if (Math.abs(mat.opacity - opacity) < 0.01 && mat.transparent === opacity < 0.98) continue;
    mat.opacity = opacity;
    mat.transparent = opacity < 0.98;
    mat.depthWrite = opacity > 0.9;
    mat.needsUpdate = true;
  }
  return shown;
}

export interface PixelStadium {
  group: THREE.Group;
  fade(cameraX: number): void;
}

const ROWS = 8;
const RISE = 0.46;
const TREAD = 1.25;
const INSET = 3.4;
const STAND_A = 14;
const STAND_B = 106;

function addStand(g: Geo, crowd: Geo, side: 1 | -1) {
  const z0 = -STAND_B;
  const z1 = -STAND_A;
  for (let i = 0; i < ROWS; i++) {
    const h = RISE * (i + 1);
    const inner = side === -1 ? -(INSET + TREAD * i) : FIELD_W + INSET + TREAD * i;
    const outer = side === -1 ? -(INSET + TREAD * (i + 1)) : FIELD_W + INSET + TREAD * (i + 1);
    const x0 = Math.min(inner, outer);
    const x1 = Math.max(inner, outer);
    addBox(g, x0, x1, 0, h, z0, z1, 2, 1);
    const pad = TREAD * 0.06;
    const y = h + 0.03;
    quad(
      crowd,
      x0 + pad, y, z0, x1 - pad, y, z0, x1 - pad, y, z1, x0 + pad, y, z1,
      z0 / 8, 0, z0 / 8, 1, z1 / 8, 1, z1 / 8, 0,
    );
  }
}

function addFence(g: Geo) {
  const f = 1.35;
  const t = 0.28;
  const h = 0.9;
  addBox(g, -f - t, -f, 0, h, -(FIELD_L + f), f, 2, 1);
  addBox(g, FIELD_W + f, FIELD_W + f + t, 0, h, -(FIELD_L + f), f, 2, 1);
  addBox(g, -f - t, FIELD_W + f + t, 0, h, f, f + t, 2, 1);
  addBox(g, -f - t, FIELD_W + f + t, 0, h, -(FIELD_L + f + t), -(FIELD_L + f), 2, 1);
}

function addGoals(g: Geo) {
  const span = 18.5 / 3;
  const half = span / 2;
  const cx = FIELD_W / 2;
  const bar = 10 / 3;
  const thick = 0.32;
  const tall = 8.2;
  for (const fieldY of [9.35, 110.65]) {
    const z = -fieldY;
    addBox(g, cx - half - thick / 2, cx - half + thick / 2, 0, tall, z - thick / 2, z + thick / 2, 1, 1);
    addBox(g, cx + half - thick / 2, cx + half + thick / 2, 0, tall, z - thick / 2, z + thick / 2, 1, 1);
    addBox(g, cx - half, cx + half, bar - thick / 2, bar + thick / 2, z - thick / 2, z + thick / 2, 1, 1);
  }
}

function addTower(g: Geo, fieldX: number, fieldY: number) {
  const x = fieldX;
  const z = -fieldY;
  const p = 0.38;
  addBox(g, x - p, x + p, 0, 9.2, z - p, z + p, 1, 2);
  const y0 = 9.2;
  const y1 = 10.15;
  const x0 = x - 1.15;
  const x1 = x + 1.15;
  const z0 = z - 0.7;
  const z1 = z + 0.7;
  // Lamp head samples the bulb rows at the top of the tower tile.
  quad(g, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, 0.82, 1, 0.82, 1, 1, 0, 1);
  quad(g, x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0, 0, 0.82, 1, 0.82, 1, 1, 0, 1);
  quad(g, x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, 0, 0.7, 1, 0.7, 1, 1, 0, 1);
  quad(g, x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, 0, 0.7, 1, 0.7, 1, 1, 0, 1);
  quad(g, x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, 0, 0.7, 1, 0.7, 1, 1, 0, 1);
  quad(g, x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1, 0, 0.7, 1, 0.7, 1, 1, 0, 1);
}

function addPress(g: Geo) {
  const y0 = RISE * ROWS;
  const y1 = y0 + 2.2;
  const x0 = FIELD_W + INSET + TREAD * (ROWS - 1);
  const x1 = x0 + TREAD + 0.6;
  const z0 = -(60 + 11);
  const z1 = -(60 - 11);
  const u = (z: number) => (z - z0) / 4;
  quad(g, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, u(z0), 1, u(z0), 1, u(z1), 1, u(z1), 1);
  quad(g, x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0, u(z1), 0, u(z1), 0, u(z0), 0, u(z0), 0);
  quad(g, x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, u(z1), 0, u(z0), 0, u(z0), 1, u(z1), 1);
  quad(g, x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, u(z0), 0, u(z1), 0, u(z1), 1, u(z0), 1);
  quad(g, x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, 0, 0, 1, 0, 1, 1, 0, 1);
  quad(g, x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1, 0, 0, 1, 0, 1, 1, 0, 1);
}

function groundQuad(): Geo {
  const padX = 40;
  const padY = 22;
  const g: Geo = { pos: [], uv: [], idx: [] };
  const x0 = -padX;
  const x1 = FIELD_W + padX;
  const y = -0.04;
  const zNear = padY;
  const zFar = -(FIELD_L + padY);
  // One tile covers four yards, so the bricks stay chunky instead of turning into scanlines.
  quad(g, x0, y, zNear, x1, y, zNear, x1, y, zFar, x0, y, zFar, x0 / 4, -padY / 2, x1 / 4, -padY / 2, x1 / 4, (FIELD_L + padY) / 2, x0 / 4, (FIELD_L + padY) / 2);
  return g;
}

function fieldQuad(): Geo {
  const g: Geo = { pos: [], uv: [], idx: [] };
  const y = 0.008;
  quad(g, 0, y, 0, FIELD_W, y, 0, FIELD_W, y, -FIELD_L, 0, y, -FIELD_L, 0, 0, 1, 0, 1, 1, 0, 1);
  return g;
}

export function buildPixelStadium(): PixelStadium {
  const group = new THREE.Group();
  group.name = 'pixel-stadium';

  const trackMat = basic(bitmapCanvas(paintTile('track')));
  const fieldMat = basic(pixelFieldCanvas());
  const plankMat = basic(bitmapCanvas(paintTile('plank')));
  const plankMatR = plankMat.clone();
  const crowdMat = basic(bitmapCanvas(paintCrowd()), true);
  const crowdMatR = crowdMat.clone();
  const fenceMat = basic(bitmapCanvas(paintTile('fence')));
  const pressMat = basic(bitmapCanvas(paintTile('press')));
  const towerMat = basic(bitmapCanvas(paintTile('tower')));
  const towerMatR = towerMat.clone();
  const goalMat = new THREE.MeshBasicMaterial({ color: 0xf0d24a, side: THREE.DoubleSide });

  group.add(meshFrom(groundQuad(), trackMat));
  group.add(meshFrom(fieldQuad(), fieldMat));

  const left: Geo = { pos: [], uv: [], idx: [] };
  const leftCrowd: Geo = { pos: [], uv: [], idx: [] };
  const right: Geo = { pos: [], uv: [], idx: [] };
  const rightCrowd: Geo = { pos: [], uv: [], idx: [] };
  addStand(left, leftCrowd, -1);
  addStand(right, rightCrowd, 1);
  const leftMesh = meshFrom(left, plankMat);
  const rightMesh = meshFrom(right, plankMatR);
  const leftDots = meshFrom(leftCrowd, crowdMat);
  const rightDots = meshFrom(rightCrowd, crowdMatR);
  group.add(leftMesh, leftDots, rightMesh, rightDots);

  const fence: Geo = { pos: [], uv: [], idx: [] };
  addFence(fence);
  group.add(meshFrom(fence, fenceMat));

  const press: Geo = { pos: [], uv: [], idx: [] };
  addPress(press);
  const pressMesh = meshFrom(press, pressMat);
  group.add(pressMesh);

  const towersL: Geo = { pos: [], uv: [], idx: [] };
  const towersR: Geo = { pos: [], uv: [], idx: [] };
  addTower(towersL, -18, -4);
  addTower(towersL, -18, FIELD_L + 4);
  addTower(towersR, FIELD_W + 18, -4);
  addTower(towersR, FIELD_W + 18, FIELD_L + 4);
  const towerLMesh = meshFrom(towersL, towerMat);
  const towerRMesh = meshFrom(towersR, towerMatR);
  group.add(towerLMesh, towerRMesh);

  const goals: Geo = { pos: [], uv: [], idx: [] };
  addGoals(goals);
  group.add(meshFrom(goals, goalMat));

  const leftMats = [plankMat, crowdMat, towerMat];
  const rightMats = [plankMatR, crowdMatR, pressMat, towerMatR];
  const leftMeshes = [leftMesh, leftDots, towerLMesh];
  const rightMeshes = [rightMesh, rightDots, pressMesh, towerRMesh];
  let lastL = -1;
  let lastR = -1;

  return {
    group,
    fade(cameraX: number) {
      const f = sidelineFade(cameraX);
      if (Math.abs(f.left - lastL) > 0.01) {
        lastL = f.left;
        const shown = setOpacity(leftMats, f.left);
        for (const m of leftMeshes) m.visible = shown;
      }
      if (Math.abs(f.right - lastR) > 0.01) {
        lastR = f.right;
        const shown = setOpacity(rightMats, f.right);
        for (const m of rightMeshes) m.visible = shown;
      }
    },
  };
}

export const PIXEL_SKY = 0x7eafd4;
export const CLASSIC_SKY = 0x10301a;

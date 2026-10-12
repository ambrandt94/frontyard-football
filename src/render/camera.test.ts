import { describe, expect, it } from 'vitest';
import { fitAngledCamera, projectField, rigAzimuth } from './camera';

const PITCH = 42;
const FOV = 36;
const ASPECT = 16 / 9;

function fit(points: { x: number; y: number; z?: number }[], extra: Partial<Parameters<typeof fitAngledCamera>[0]> = {}) {
  return fitAngledCamera({
    points,
    aspect: ASPECT,
    pitch: PITCH,
    fov: FOV,
    azimuth: rigAzimuth('all22', 1),
    upfieldBias: 8,
    heightBias: 1.12,
    minYards: 40,
    padding: 7,
    panelShift: 0,
    attack: 1,
    ...extra,
  });
}

describe('angled camera', () => {
  it('puts upfield higher on screen than the look point', () => {
    const n0 = projectField({ x: 26, y: 40, z: 0 }, 26, 40, 80, PITCH, 0, FOV, ASPECT);
    const n1 = projectField({ x: 26, y: 55, z: 0 }, 26, 40, 80, PITCH, 0, FOV, ASPECT);
    expect(n1.y).toBeGreaterThan(n0.y + 0.05);
    expect(Math.abs(n0.x)).toBeLessThan(0.05);
  });

  it('keeps a 50-yard throw, the ball, and the landing inside the frame', () => {
    const qb = { x: 26.7, y: 30, z: 2.1 };
    const wr = { x: 14, y: 48, z: 2.1 };
    const ball = { x: 18, y: 58, z: 14 };
    const landing = { x: 16, y: 84, z: 0 };
    const pose = fit([qb, wr, ball, landing]);
    for (const p of [qb, wr, ball, landing]) {
      const n = projectField(p, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT);
      expect(n.depth).toBeGreaterThan(1);
      expect(Math.abs(n.x)).toBeLessThan(0.98);
      expect(Math.abs(n.y)).toBeLessThan(0.98);
    }
    const near = projectField(qb, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT);
    const far = projectField(landing, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT);
    expect(far.y).toBeGreaterThan(near.y);
    console.log(
      `all22 deep look=(${pose.lookX.toFixed(1)}, ${pose.lookY.toFixed(1)}) dist=${pose.dist.toFixed(1)} ` +
        `landing ndc=(${far.x.toFixed(2)}, ${far.y.toFixed(2)}) ball z ndc y=` +
        projectField(ball, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT).y.toFixed(2),
    );
  });

  it('still covers 40 yards when the action is a tight cluster', () => {
    const pose = fit([
      { x: 26, y: 36, z: 2 },
      { x: 28, y: 38, z: 2 },
    ]);
    const back = projectField({ x: pose.lookX, y: pose.lookY - 20, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT);
    const ahead = projectField({ x: pose.lookX, y: pose.lookY + 20, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, 0, FOV, ASPECT);
    expect(Math.abs(back.y)).toBeLessThan(1);
    expect(Math.abs(ahead.y)).toBeLessThan(1);
    expect(ahead.y).toBeGreaterThan(back.y);
  });

  it('slides the look point upfield as the bias grows', () => {
    const pts = [{ x: 26, y: 34, z: 2 }, { x: 16, y: 50, z: 2 }];
    const a = fit(pts, { upfieldBias: 0 });
    const b = fit(pts, { upfieldBias: 14 });
    expect(b.lookY).toBeGreaterThan(a.lookY + 10);
  });

  it('puts the goal being attacked toward the top after an interception', () => {
    const azimuth = rigAzimuth('all22', -1);
    const pose = fit(
      [{ x: 26, y: 40, z: 2 }, { x: 20, y: 28, z: 2 }],
      { azimuth, attack: -1 },
    );
    const back = projectField({ x: 26, y: 48, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, azimuth, FOV, ASPECT);
    const home = projectField({ x: 26, y: 18, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, azimuth, FOV, ASPECT);
    expect(home.y).toBeGreaterThan(back.y + 0.05);
  });

  it('frames the same deep throw from the sideline', () => {
    const pts = [
      { x: 26.7, y: 30, z: 2.1 },
      { x: 14, y: 70, z: 2.1 },
      { x: 18, y: 55, z: 10 },
    ];
    const azimuth = rigAzimuth('broadcast', 1);
    const pose = fit(pts, { azimuth });
    for (const p of pts) {
      const n = projectField(p, pose.lookX, pose.lookY, pose.dist, PITCH, azimuth, FOV, ASPECT);
      expect(Math.abs(n.x)).toBeLessThan(0.98);
      expect(Math.abs(n.y)).toBeLessThan(0.98);
    }
    const low = projectField({ x: 20, y: 30, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, azimuth, FOV, ASPECT);
    const high = projectField({ x: 20, y: 50, z: 0 }, pose.lookX, pose.lookY, pose.dist, PITCH, azimuth, FOV, ASPECT);
    expect(high.x).toBeGreaterThan(low.x);
  });
});

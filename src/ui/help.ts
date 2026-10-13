import type { ModeId } from '../modes';
import { MODE_LABEL } from '../modes';

const SEEN_KEY = 'tdfb.sandbox.help.seen';
const OPEN_KEY = 'tdfb.sandbox.help.open';

type SectionId = 'everyone' | 'qb' | 'receiver' | 'carrier' | 'defender';

const MODE_SECTIONS: Record<ModeId, SectionId[]> = {
  throw: ['everyone', 'qb', 'receiver', 'carrier'],
  coverage: ['everyone', 'defender', 'receiver', 'carrier'],
  run: ['everyone', 'carrier', 'defender'],
  catch: ['everyone', 'receiver', 'carrier'],
  free: ['everyone', 'qb', 'receiver'],
};

const A = pad('a', 'A');
const B = pad('b', 'B');
const X = pad('x', 'X');
const Y = pad('y', 'Y');
const LB = pad('lb', 'LB');
const RB = pad('rb', 'RB');
const LT = pad('lt', 'LT');
const RT = pad('rt', 'RT');
const LS = pad('stick', 'LS');
const RS = pad('stick', 'RS');
const L3 = pad('l3', 'L3');
const R3 = pad('r3', 'R3');
const BACK = pad('back', 'Back');
const START = pad('start', 'Start');

function pad(kind: string, label: string): string {
  return `<i class="pad ${kind}">${label}</i>`;
}

function key(label: string): string {
  return `<kbd>${label}</kbd>`;
}

function row(act: string, detail: string): string {
  return `<div class="help-row"><div class="help-act">${act}</div><div class="help-detail">${detail}</div></div>`;
}

function section(id: SectionId, title: string, rows: string): string {
  return `<section class="help-sec" data-sec="${id}"><h5>${title}</h5>${rows}</section>`;
}

const BODY = [
  section('everyone', 'Everyone', [
    row(`${LS} ${key('W')}${key('A')}${key('S')}${key('D')}`, 'Move. A little tilt jogs, full tilt runs. Hold C to jog.'),
    row(`${L3} ${key('Shift')}`, 'Sprint pump. Each click adds speed, then it fades. Cuts dump it faster.'),
    row(`${A} ${key('Space')}`, 'Snap, before the play is live.'),
    row(`${BACK} ${key('Tab')}`, 'Switch the player you control.'),
    row(`${START} ${key('R')}`, 'Reset the play. In Catch, Start pauses throws. Hold Start, or Back+Start, to hide this card.'),
    row(`${key('H')} ${key('G')}`, 'Hide this card. G hides the settings panel. ` shows the net readout.'),
    row(`${key('N')} ${key('M')} ${key('K')}`, 'Next mode (D-pad up). M swaps 3D and the flat field. K cycles QB aim. The 3D view starts as an All-22 angle.'),
    row(`${key('+')} ${key('−')} ${key('C')}`, 'Zoom in and out (wheel does this too, and D-pad down cycles close, medium, wide). Tap C to cycle All-22, Top-down, and Broadcast. Hold C still jogs. The camera buttons sit in the corner.'),
    row(`${key('T')}`, 'Slow motion. Cycles 0.5×, 0.25×, and full speed.'),
  ].join('')),
  section('qb', 'Quarterback', [
    row(`${R3} ${key('L')}`, 'Flip the right stick. THROW aims and throws. CARRY jukes, spins, sidesteps, and trucks. The QB starts in THROW. Crossing the line of scrimmage with the ball switches him to CARRY, and stepping back does not switch him back. The chip by the player shows which one.'),
    row(`${RS} ${key('Mouse')} ${key('K')}`, 'Aim while you hold the stick. K switches Absolute+ (angle and distance) and Direction charge (the stick picks the line, RT slides the distance). A small ease-off keeps the aim. Letting the stick go back to center while RT is still held cancels the wind-up, and nothing is thrown.'),
    row(`${RT}`, 'With the stick held, squeeze to charge the distance. Release to throw that spot: a light squeeze is a touch or a lob. Burying the trigger throws a bullet to that spot immediately. A quick brush does nothing. With the stick centered, a squeeze opens a short pitch window. Flick the stick to choose the direction. A gentle flick is a little short, a fast flick a little long. Miss the window and nothing happens. In CARRY, that centered squeeze only pitches.'),
    row(`${key('Mouse')} ${key('F')}`, 'Hold the left button and release for a touch. Hold F during that press for a bullet. F alone, with the arrows centered, opens the pitch window.'),
  ].join('')),
  section('receiver', 'Receiver', [
    row(`${Y} ${key('E')}`, 'Timed catch. Before the throw, the same button calls for the ball.'),
    row(`${RT} ${key('F')}`, 'One-hand catch.'),
    row(`${RB} ${key('V')}`, 'Tap to plant. Hold to stretch into a toe-tap.'),
    row(`${A} ${X} ${B}`, 'Jump, dive, or bat the ball.'),
    row(`${LT} ${key('Q')}`, 'Square up for a two-hand catch. Catch mode and Throw Around use this whole set. In Throw Around, anyone who is not holding the ball is the receiver.'),
    row(`${RS} ${key('Arrows')}`, 'After the catch, Throw Around keeps the carrier flicks, hurdle, and dive. The player with the ball is the quarterback until they throw it.'),
  ].join('')),
  section('carrier', 'Ball carrier', [
    row(`${RS} ${key('Arrows')}`, 'Flick with your run: sideways sidesteps, up trucks, down jukes, diagonals spin.'),
    row(`${A} ${X}`, 'Hurdle, or dive forward.'),
    row(`${LB} ${RB}`, 'Tap to switch hands. Hold to stiff-arm.'),
    row(`${RT} ${RS}`, 'In CARRY, squeeze RT with the stick centered to open the pitch window, then flick. The receiver after a catch, the running back, and the QB past the line all pitch this way. A full squeeze does not throw.'),
  ].join('')),
  section('defender', 'Defender', [
    row(`${LT} ${key('Q')}`, 'Break down and square up. A lunge from here is shorter and wraps more often.'),
    row(`${A} ${key('Space')}`, 'Jump, the same as a receiver, to contest or knock down a high ball.'),
    row(`${RS} ${key('Arrows')}`, 'Lunge that way on the field. Forward at speed goes farthest. Sideways is shorter, backward is weak. A miss takes longer to recover the farther you went. Reads LUNGE, WRAP, or MISSED.'),
    row(`${X} ${key('X')}`, 'Low diving tackle. This is the dive. The right stick is not.'),
    row(`${Y} ${B}`, 'Play the ball: interception or punch, or bat it down.'),
    row(`${LB} ${key('Z')}`, 'Arm-check in coverage. Hold it too long and the play flags holding.'),
  ].join('')),
].join('');

function readOpen(): boolean {
  try {
    if (!localStorage.getItem(SEEN_KEY)) {
      localStorage.setItem(SEEN_KEY, '1');
      return true;
    }
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* private mode */ }
}

export function createHelp(root: HTMLElement, pill: HTMLElement) {
  let mode: ModeId = 'throw';
  let open = readOpen();
  let showAll = false;
  root.classList.add('help-card');
  root.innerHTML = `
    <div class="help-head">
      <strong>Controls</strong>
      <span class="help-mode"></span>
      <button type="button" class="help-all">Show all</button>
      <button type="button" class="help-hide">Hide</button>
    </div>
    <div class="help-body">${BODY}</div>`;
  const modeEl = root.querySelector('.help-mode') as HTMLElement;
  const allBtn = root.querySelector('.help-all') as HTMLButtonElement;
  root.querySelector('.help-hide')?.addEventListener('click', () => setOpen(false));
  allBtn.addEventListener('click', () => {
    showAll = !showAll;
    allBtn.textContent = showAll ? 'This mode' : 'Show all';
    applySections();
  });
  pill.addEventListener('click', () => setOpen(true));

  function applySections() {
    const show = new Set<SectionId>(showAll
      ? ['everyone', 'qb', 'receiver', 'carrier', 'defender']
      : MODE_SECTIONS[mode]);
    root.querySelectorAll<HTMLElement>('.help-sec').forEach((el) => {
      const id = el.dataset.sec as SectionId;
      el.classList.toggle('is-off', !show.has(id));
    });
    modeEl.textContent = showAll ? 'All roles' : MODE_LABEL[mode];
  }

  function paint() {
    root.classList.toggle('hidden', !open);
    pill.classList.toggle('hidden', open);
    applySections();
  }

  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    writeOpen(open);
    paint();
  }

  paint();
  return {
    toggle() { setOpen(!open); },
    setMode(next: ModeId) {
      if (next === mode) return;
      mode = next;
      applySections();
    },
    isOpen: () => open,
  };
}

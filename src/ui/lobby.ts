import { MP_MODE_IDS, MODE_LABEL, type ModeId } from '../modes';
import type { NetSession } from '../net/session';
import { slotsFor } from '../net/slots';

const NAME_KEY = 'tdfb.sandbox.netname';

export interface Lobby {
  open(): void;
  update(): void;
  paintStats(): void;
  boot(): void;
}

export function createLobby(opts: { session: NetSession }): Lobby {
  const { session } = opts;
  const root = document.createElement('div');
  root.id = 'lobby';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="card">
      <h2>Online</h2>
      <p class="hint">Host a game and send the link. 2–6 players, no account. Catch mode stays single-player.</p>
      <div id="lobby-setup">
        <label>Name <input id="net-name" maxlength="16" autocomplete="nickname"></label>
        <div class="row">
          <button id="net-host" type="button">Host game</button>
          <input id="net-code" maxlength="4" placeholder="Code" autocomplete="off">
          <button id="net-join" type="button">Join</button>
          <button id="net-close" type="button">Close</button>
        </div>
      </div>
      <div id="lobby-room" class="hidden">
        <div class="code-line">Room <b id="net-code-label"></b></div>
        <label>Link <input id="net-link" readonly></label>
        <button id="net-copy" type="button">Copy link</button>
        <ul id="net-players"></ul>
        <label id="net-mode-wrap">Mode
          <select id="net-mode"></select>
        </label>
        <label id="net-count-wrap" class="hidden">Players on the field
          <input id="net-count" type="number" min="2" max="6" step="1" value="4">
        </label>
        <label>Your slot <select id="net-slot"></select></label>
        <div class="row">
          <button id="net-start" type="button">Start</button>
          <button id="net-leave" type="button">Leave</button>
        </div>
      </div>
      <div id="lobby-ended" class="hidden">
        <p id="net-ended"></p>
        <button id="net-back" type="button">Back</button>
      </div>
      <p id="net-status"></p>
    </div>`;
  document.body.appendChild(root);

  const openBtn = document.createElement('button');
  openBtn.id = 'net-open';
  openBtn.type = 'button';
  openBtn.textContent = 'Online';
  document.body.appendChild(openBtn);

  const stats = document.createElement('div');
  stats.id = 'netstats';
  stats.className = 'hidden';
  document.body.appendChild(stats);

  const statsBtn = document.createElement('button');
  statsBtn.id = 'net-stats-btn';
  statsBtn.type = 'button';
  statsBtn.textContent = 'Net';
  statsBtn.className = 'hidden';
  document.body.appendChild(statsBtn);

  const nameEl = mustInput('net-name');
  const codeEl = mustInput('net-code');
  const linkEl = mustInput('net-link');
  const modeEl = document.getElementById('net-mode') as HTMLSelectElement;
  const countEl = mustInput('net-count');
  const slotEl = document.getElementById('net-slot') as HTMLSelectElement;
  const playersEl = document.getElementById('net-players') as HTMLElement;
  const statusEl = document.getElementById('net-status') as HTMLElement;
  let listKey = '';
  let opened = false;

  nameEl.value = localStorage.getItem(NAME_KEY) || '';
  for (const id of MP_MODE_IDS) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = MODE_LABEL[id];
    modeEl.appendChild(opt);
  }

  function show(setup: boolean, room: boolean, ended: boolean) {
    root.classList.remove('hidden');
    byId('lobby-setup').classList.toggle('hidden', !setup);
    byId('lobby-room').classList.toggle('hidden', !room);
    byId('lobby-ended').classList.toggle('hidden', !ended);
  }

  function update() {
    const rejoin = session.phase === 'play' && !session.mySlot;
    const inRoom = session.phase === 'lobby' || rejoin;
    if (session.phase === 'ended') {
      root.classList.remove('hidden');
      show(false, false, true);
      const ended = document.getElementById('net-ended');
      if (ended) ended.textContent = session.endedReason || 'This room is over.';
    } else if (inRoom) {
      root.classList.remove('hidden');
      show(false, true, false);
      const label = document.getElementById('net-code-label');
      if (label) label.textContent = session.roomCode;
      if (document.activeElement !== linkEl) linkEl.value = session.shareUrl;
      const host = session.role === 'host';
      byId('net-mode-wrap').classList.toggle('hidden', !host || session.phase === 'play');
      byId('net-count-wrap').classList.toggle('hidden', !host || session.mode !== 'free' || session.phase === 'play');
      byId('net-start').classList.toggle('hidden', !host || session.phase === 'play');
      if (host && modeEl.value !== session.mode && document.activeElement !== modeEl) modeEl.value = session.mode;
      if (host && document.activeElement !== countEl) countEl.value = String(session.freeCount);
      fillSlots();
      paintPlayers();
    } else if (session.phase === 'play') {
      root.classList.add('hidden');
    } else if (opened) {
      root.classList.remove('hidden');
      show(true, false, false);
    } else {
      root.classList.add('hidden');
    }
    statusEl.textContent = session.status;
    statsBtn.classList.toggle('hidden', session.phase !== 'play' && session.phase !== 'lobby');
    paintStats();
  }

  function fillSlots() {
    const slots = slotsFor(session.mode, session.freeCount);
    const takenBy = session.players.filter((p) => p.slot && p.peerId !== session.myPeerId).map((p) => p.slot).join(',');
    const wanted = ['', ...slots.map((s) => s.id)].join(',') + ':' + takenBy;
    if (slotEl.dataset.slots === wanted && slotEl.value === (session.mySlot || '')) return;
    slotEl.dataset.slots = wanted;
    slotEl.innerHTML = '';
    const watch = document.createElement('option');
    watch.value = '';
    watch.textContent = 'Watching';
    slotEl.appendChild(watch);
    for (const slot of slots) {
      const opt = document.createElement('option');
      opt.value = slot.id;
      const taken = session.players.some((p) => p.slot === slot.id && p.peerId !== session.myPeerId);
      opt.textContent = slot.label + (taken ? ' (taken)' : '');
      opt.disabled = taken;
      slotEl.appendChild(opt);
    }
    slotEl.value = session.mySlot || '';
  }

  function paintPlayers() {
    const key = session.players.map((p) => `${p.peerId}:${p.slot}:${p.name}:${p.host}`).join('|') + session.mode;
    if (key !== listKey) {
      listKey = key;
      playersEl.innerHTML = '';
      for (const p of session.players) {
        const li = document.createElement('li');
        li.dataset.peer = p.peerId;
        const slot = slotsFor(session.mode, session.freeCount).find((s) => s.id === p.slot);
        li.innerHTML = `<span class="who"></span><span class="slot"></span><span class="ping"></span>`;
        li.querySelector('.who')!.textContent = p.name + (p.host ? ' (host)' : '');
        li.querySelector('.slot')!.textContent = slot ? slot.label : 'watching';
        playersEl.appendChild(li);
      }
    }
    for (const p of session.players) {
      const li = playersEl.querySelector(`[data-peer="${cssEscape(p.peerId)}"]`);
      const ping = li?.querySelector('.ping');
      if (ping) ping.textContent = p.host && p.ping === 0 ? 'host' : `${p.ping} ms`;
    }
  }

  function paintStats() {
    const show = session.showStats && (session.phase === 'play' || session.phase === 'lobby');
    stats.classList.toggle('hidden', !show);
    if (!show) return;
    const worst = session.players.reduce((m, p) => Math.max(m, p.ping), session.ping);
    const ping = session.role === 'host' ? (worst ? `${worst} ms` : 'host') : `${session.ping} ms`;
    stats.textContent = `ping ${ping} · snapshots ${session.snapHz}/s`;
  }

  openBtn.addEventListener('click', () => {
    if (session.phase === 'idle' || session.phase === 'ended') {
      session.leave();
      opened = true;
      root.classList.remove('hidden');
      show(true, false, false);
      statusEl.textContent = 'Host a room, or join with a code.';
    } else update();
  });
  root.querySelector('#net-close')!.addEventListener('click', () => {
    opened = false;
    root.classList.add('hidden');
  });
  root.querySelector('#net-host')!.addEventListener('click', () => {
    const name = nameEl.value;
    localStorage.setItem(NAME_KEY, name);
    void session.host(name).catch(() => update());
  });
  root.querySelector('#net-join')!.addEventListener('click', () => {
    const name = nameEl.value;
    localStorage.setItem(NAME_KEY, name);
    void session.join(codeEl.value, name).catch(() => update());
  });
  root.querySelector('#net-leave')!.addEventListener('click', () => session.leave());
  root.querySelector('#net-back')!.addEventListener('click', () => session.leave());
  root.querySelector('#net-start')!.addEventListener('click', () => session.start());
  root.querySelector('#net-copy')!.addEventListener('click', async () => {
    linkEl.select();
    try { await navigator.clipboard.writeText(linkEl.value); statusEl.textContent = 'Link copied.'; }
    catch { statusEl.textContent = 'Select the link and copy it.'; }
  });
  modeEl.addEventListener('change', () => session.setMode(modeEl.value as ModeId));
  countEl.addEventListener('change', () => session.setFreeCount(Number(countEl.value)));
  slotEl.addEventListener('change', () => session.claim(slotEl.value));
  statsBtn.addEventListener('click', () => session.toggleStats());
  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName || '';
    if (e.code === 'Backquote' && !/INPUT|SELECT|TEXTAREA/.test(tag)) {
      e.preventDefault();
      session.toggleStats();
    }
  });

  return {
    open() {
      opened = true;
      root.classList.remove('hidden');
      show(session.phase === 'idle' || session.phase === 'ended', session.phase === 'lobby', session.phase === 'ended');
    },
    update,
    paintStats,
    boot() {
      const room = new URLSearchParams(location.search).get('room');
      if (!room) return;
      const name = localStorage.getItem(NAME_KEY) || 'Guest';
      nameEl.value = name;
      opened = true;
      root.classList.remove('hidden');
      show(false, false, false);
      statusEl.textContent = 'Joining ' + room + '…';
      void session.join(room, name).catch(() => update());
    },
  };
}

function byId(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}
function mustInput(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error('missing #' + id);
  return el;
}
function cssEscape(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}

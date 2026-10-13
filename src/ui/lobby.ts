import { MP_MODE_IDS, MODE_LABEL, type ModeId } from '../modes';
import type { NetSession } from '../net/session';
import { slotsFor } from '../net/slots';
import { hexCss } from '../sim/look';
import { loadProfile } from '../sim/profile';

export interface Lobby {
  open(): void;
  update(): void;
  paintStats(): void;
  boot(): void;
}

export function createLobby(opts: { session: NetSession; onEditPlayer: () => void }): Lobby {
  const { session } = opts;
  const root = document.createElement('div');
  root.id = 'lobby';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="card">
      <h2>Online</h2>
      <div id="lobby-setup">
        <p class="hint">Host a room or join with a code. 2–6 players. Catch stays single-player.</p>
        <p class="playing-as">Playing as <b id="net-as"></b> <button id="net-edit" type="button" class="ghost">My Player</button></p>
        <div class="row">
          <button id="net-host" type="button">Host</button>
          <input id="net-code" maxlength="4" placeholder="Code" autocomplete="off">
          <button id="net-join" type="button">Join</button>
        </div>
        <button id="net-close" type="button" class="ghost">Close</button>
      </div>
      <div id="lobby-room" class="hidden">
        <div class="lobby-top">
          <div class="lobby-id">
            <div class="code-line">Room <b id="net-code-label"></b>
              <button id="net-copy" type="button">Copy link</button>
            </div>
            <label class="slim">Link <input id="net-link" readonly></label>
            <p class="you">You · <b id="net-you"></b></p>
          </div>
        </div>
        <ul id="net-players"></ul>
        <div class="lobby-controls">
          <label id="net-mode-wrap">Mode <select id="net-mode"></select></label>
          <label id="net-count-wrap" class="hidden">On the field <input id="net-count" type="number" min="2" max="6" step="1" value="4"></label>
          <label id="net-slot-wrap">Your role <select id="net-slot"></select></label>
        </div>
        <p id="net-wait" class="hidden">Waiting for host</p>
        <div class="row">
          <button id="net-start" type="button">Start</button>
          <button id="net-leave" type="button" class="ghost">Leave</button>
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

  const chips = document.createElement('div');
  chips.id = 'roster-chips';
  chips.className = 'hidden';
  chips.innerHTML = `<button id="roster-toggle" type="button">Players</button><div id="roster-row"></div>`;
  document.body.appendChild(chips);
  let chipsCollapsed = false;

  const codeEl = mustInput('net-code');
  const linkEl = mustInput('net-link');
  const modeEl = document.getElementById('net-mode') as HTMLSelectElement;
  const countEl = mustInput('net-count');
  const slotEl = document.getElementById('net-slot') as HTMLSelectElement;
  const playersEl = document.getElementById('net-players') as HTMLElement;
  const statusEl = document.getElementById('net-status') as HTMLElement;
  const rowEl = document.getElementById('roster-row') as HTMLElement;
  let listKey = '';
  let chipKey = '';
  let opened = false;

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

  function playingAs() {
    return loadProfile()?.name || 'Player';
  }

  function update() {
    const as = document.getElementById('net-as');
    if (as) as.textContent = playingAs();
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
      const you = document.getElementById('net-you');
      const mine = session.players.find((p) => p.peerId === session.myPeerId);
      if (you) you.textContent = mine?.name || playingAs();
      const host = session.role === 'host';
      byId('net-mode-wrap').classList.toggle('hidden', !host);
      byId('net-count-wrap').classList.toggle('hidden', !host || session.mode !== 'free');
      byId('net-start').classList.toggle('hidden', !host);
      byId('net-wait').classList.toggle('hidden', host);
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
    const netOn = session.phase === 'play' || session.phase === 'lobby';
    statsBtn.classList.toggle('hidden', !netOn);
    chips.classList.toggle('hidden', session.phase !== 'play');
    chips.classList.toggle('collapsed', chipsCollapsed);
    paintChips();
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
    const key = session.players.map((p) => `${p.peerId}:${p.slot}:${p.name}:${p.host}:${p.look?.jersey}:${p.look?.skin}`).join('|') + session.mode + session.freeCount;
    if (key === listKey) {
      for (const p of session.players) {
        const li = playersEl.querySelector(`[data-peer="${cssEscape(p.peerId)}"]`);
        const ping = li?.querySelector('.ping');
        if (ping) ping.textContent = p.ping ? `${p.ping} ms` : '—';
      }
      return;
    }
    listKey = key;
    playersEl.innerHTML = '';
    const slots = slotsFor(session.mode, session.freeCount);
    for (const p of session.players) {
      const li = document.createElement('li');
      li.dataset.peer = p.peerId;
      const sw = document.createElement('i');
      sw.className = 'swatch';
      sw.style.background = hexCss(p.look?.jersey ?? 0x888888);
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = p.name;
      li.append(sw, who);
      if (p.host) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Host';
        li.appendChild(badge);
      }
      const sel = document.createElement('select');
      sel.className = 'row-slot';
      const watch = document.createElement('option');
      watch.value = '';
      watch.textContent = 'Watching';
      sel.appendChild(watch);
      for (const slot of slots) {
        const opt = document.createElement('option');
        opt.value = slot.id;
        const taken = session.players.some((o) => o.slot === slot.id && o.peerId !== p.peerId);
        opt.textContent = slot.label;
        opt.disabled = taken;
        sel.appendChild(opt);
      }
      sel.value = p.slot || '';
      const mine = p.peerId === session.myPeerId;
      sel.disabled = !mine;
      if (mine) sel.addEventListener('change', () => session.claim(sel.value));
      const ping = document.createElement('span');
      ping.className = 'ping';
      ping.textContent = p.ping ? `${p.ping} ms` : '—';
      li.append(sel, ping);
      playersEl.appendChild(li);
    }
  }

  function paintChips() {
    if (session.phase !== 'play') return;
    const seated = session.players.filter((p) => p.slot);
    const key = seated.map((p) => `${p.peerId}:${p.name}:${p.look?.jersey}:${p.slot}`).join('|');
    if (key === chipKey) return;
    chipKey = key;
    rowEl.innerHTML = '';
    for (const p of seated) {
      const chip = document.createElement('span');
      chip.className = 'roster-chip';
      const sw = document.createElement('i');
      sw.style.background = hexCss(p.look?.jersey ?? 0x888888);
      const name = document.createElement('span');
      name.textContent = p.name;
      chip.append(sw, name);
      rowEl.appendChild(chip);
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
  root.querySelector('#net-edit')!.addEventListener('click', () => opts.onEditPlayer());
  root.querySelector('#net-host')!.addEventListener('click', () => {
    const profile = loadProfile();
    if (!profile) { opts.onEditPlayer(); return; }
    void session.host(profile.name).catch(() => update());
  });
  root.querySelector('#net-join')!.addEventListener('click', () => {
    const profile = loadProfile();
    if (!profile) { opts.onEditPlayer(); return; }
    void session.join(codeEl.value, profile.name).catch(() => update());
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
  chips.querySelector('#roster-toggle')!.addEventListener('click', () => {
    chipsCollapsed = !chipsCollapsed;
    chips.classList.toggle('collapsed', chipsCollapsed);
  });
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
      const profile = loadProfile();
      if (!profile) return;
      opened = true;
      root.classList.remove('hidden');
      show(false, false, false);
      statusEl.textContent = 'Joining ' + room + '…';
      void session.join(room, profile.name).catch(() => update());
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

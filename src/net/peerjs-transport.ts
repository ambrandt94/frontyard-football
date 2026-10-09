import type { IceServer, NetTransport, SignalConfig } from './types';

interface Conn {
  peer: string;
  open: boolean;
  send(data: string): void;
  close(): void;
  on(ev: 'data', cb: (data: unknown) => void): void;
  on(ev: 'open', cb: () => void): void;
  on(ev: 'close', cb: () => void): void;
  on(ev: 'error', cb: (err: Error) => void): void;
}

interface PeerLike {
  id: string;
  on(ev: 'open', cb: (id: string) => void): void;
  on(ev: 'connection', cb: (conn: Conn) => void): void;
  on(ev: 'error', cb: (err: Error & { type?: string }) => void): void;
  connect(id: string, opts: { reliable: boolean; serialization: 'json' }): Conn;
  destroy(): void;
}

/**
 * PeerJS data channels. Signaling goes through the public broker (or a local
 * PeerServer in tests). Messages are JSON strings so binary-pack never sees undefined.
 */
export async function createPeerTransport(): Promise<NetTransport> {
  const mod = await import('peerjs');
  const PeerCtor = mod.default as unknown as new (id: string | undefined, opts: Record<string, unknown>) => PeerLike;
  let peer: PeerLike | null = null;
  let localId: string | null = null;
  const conns = new Map<string, Conn>();
  const queued = new Map<string, string[]>();
  let onData: (peerId: string, data: unknown) => void = () => {};
  let onClose: (peerId: string) => void = () => {};

  function flush(conn: Conn) {
    const waiting = queued.get(conn.peer);
    if (!waiting?.length || !conn.open) return;
    queued.delete(conn.peer);
    for (const data of waiting) conn.send(data);
  }

  function opts(ice: IceServer[], signal: SignalConfig) {
    return {
      host: signal.host,
      port: signal.port,
      path: signal.path,
      secure: signal.secure,
      debug: 0,
      config: { iceServers: ice },
    };
  }

  function watch(conn: Conn) {
    conns.set(conn.peer, conn);
    conn.on('data', (data) => onData(conn.peer, data));
    conn.on('open', () => flush(conn));
    if (conn.open) flush(conn);
    conn.on('close', () => {
      conns.delete(conn.peer);
      queued.delete(conn.peer);
      onClose(conn.peer);
    });
    conn.on('error', () => {
      conns.delete(conn.peer);
      onClose(conn.peer);
    });
  }

  function openPeer(id: string | undefined, ice: IceServer[], signal: SignalConfig): Promise<void> {
    peer?.destroy();
    peer = new PeerCtor(id, opts(ice, signal));
    return new Promise((resolve, reject) => {
      let settled = false;
      peer!.on('open', (opened) => {
        if (settled) return;
        settled = true;
        localId = opened;
        resolve();
      });
      peer!.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err.type || err.message || 'peer error'));
      });
      peer!.on('connection', (conn) => {
        watch(conn);
        if (!conn.open) conn.on('open', () => { /* data listener already attached */ });
      });
    });
  }

  return {
    get localId() { return localId; },
    startHost(peerId, ice, signal) { return openPeer(peerId, ice, signal); },
    startClient(ice, signal) { return openPeer(undefined, ice, signal); },
    connect(remoteId) {
      if (!peer) return Promise.reject(new Error('not connected'));
      const conn = peer.connect(remoteId, { reliable: true, serialization: 'json' });
      watch(conn);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 15000);
        conn.on('open', () => { clearTimeout(timer); resolve(); });
        conn.on('error', (err) => { clearTimeout(timer); reject(err); });
      });
    },
    send(peerId, data) {
      const conn = conns.get(peerId);
      if (conn?.open) conn.send(data);
      else {
        const waiting = queued.get(peerId) ?? [];
        waiting.push(data);
        queued.set(peerId, waiting);
      }
    },
    broadcast(data) {
      for (const conn of conns.values()) if (conn.open) conn.send(data);
    },
    onData(cb) { onData = cb; },
    onClose(cb) { onClose = cb; },
    close() {
      for (const conn of conns.values()) conn.close();
      conns.clear();
      peer?.destroy();
      peer = null;
      localId = null;
    },
  };
}

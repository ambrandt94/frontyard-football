import type { SignalConfig } from './types';

export const PUBLIC_SIGNAL: SignalConfig = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
};

/** Tests set window.__netSignal to a local PeerServer before the page connects. */
export function readSignal(): SignalConfig {
  const injected = (globalThis as { __netSignal?: SignalConfig }).__netSignal;
  if (injected && injected.host) return injected;
  return PUBLIC_SIGNAL;
}

export function roomLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

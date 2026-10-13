import type { Page } from '@playwright/test';

/** Returning visitor, so the create-player modal stays out of the way of older tests. */
export function installTestProfile() {
  const look = { jersey: 0x1e63c9, pants: 0xf2f2f2, helmet: 0xf5f5f5, skin: 'light' };
  if (!localStorage.getItem('tdfb.sandbox.player')) {
    localStorage.setItem('tdfb.sandbox.player', JSON.stringify({ name: 'Player', look }));
    localStorage.setItem('tdfb.sandbox.netname', 'Player');
    localStorage.setItem('tdfb.sandbox.look', JSON.stringify(look));
  }
}

/** Point this browser's saved player at a name without touching the kit already chosen. */
export async function useName(page: Page, name: string) {
  await page.evaluate((n) => {
    const profileRaw = localStorage.getItem('tdfb.sandbox.player');
    const lookRaw = localStorage.getItem('tdfb.sandbox.look');
    const profile = profileRaw ? JSON.parse(profileRaw) as { look?: unknown } : {};
    const look = lookRaw ? JSON.parse(lookRaw) : profile.look ?? { jersey: 0x1e63c9, pants: 0xf2f2f2, helmet: 0xf5f5f5, skin: 'light' };
    localStorage.setItem('tdfb.sandbox.player', JSON.stringify({ name: n, look }));
    localStorage.setItem('tdfb.sandbox.netname', n);
  }, name);
}

/** Public files are served under Vite's `base` (GitHub Pages project path). */
export function assetUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}assets/${file.replace(/^\//, '')}`;
}

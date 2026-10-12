import { hexCss, loadLook, SKIN_TONE, SWATCHES, type Look } from '../sim/look';

export function mountLookEditor(parent: HTMLElement, opts: { onChange: (look: Look) => void }): { refresh(): void } {
  const root = document.createElement('div');
  root.className = 'look-editor';
  root.innerHTML = `
    <div class="look-preview" aria-hidden="true">
      <i class="helm"></i><i class="face"></i><b class="jersey">12</b><i class="pants"></i>
    </div>
    <div class="look-fields"></div>`;
  parent.appendChild(root);
  const fields = root.querySelector('.look-fields') as HTMLElement;
  const parts: { key: 'jersey' | 'pants' | 'helmet'; label: string }[] = [
    { key: 'jersey', label: 'Jersey' },
    { key: 'pants', label: 'Pants' },
    { key: 'helmet', label: 'Helmet' },
  ];
  for (const part of parts) {
    const row = document.createElement('div');
    row.className = 'look-row';
    const lab = document.createElement('span');
    lab.textContent = part.label;
    row.appendChild(lab);
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const color of SWATCHES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn';
      btn.style.background = hexCss(color);
      btn.title = hexCss(color);
      btn.dataset.part = part.key;
      btn.dataset.color = String(color);
      sw.appendChild(btn);
    }
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.dataset.part = part.key;
    custom.title = part.label + ' color';
    sw.appendChild(custom);
    row.appendChild(sw);
    fields.appendChild(row);
  }
  const skinRow = document.createElement('div');
  skinRow.className = 'look-row';
  const skinLab = document.createElement('span');
  skinLab.textContent = 'Skin';
  skinRow.appendChild(skinLab);
  const skins = document.createElement('div');
  skins.className = 'skin-picks';
  for (const tone of ['light', 'dark'] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skin-btn';
    btn.dataset.skin = tone;
    btn.textContent = tone === 'light' ? 'Light' : 'Dark';
    skins.appendChild(btn);
  }
  skinRow.appendChild(skins);
  fields.appendChild(skinRow);

  function paint() {
    const look = loadLook();
    const preview = root.querySelector('.look-preview') as HTMLElement;
    (preview.querySelector('.helm') as HTMLElement).style.background = hexCss(look.helmet);
    (preview.querySelector('.face') as HTMLElement).style.background = hexCss(SKIN_TONE[look.skin]);
    (preview.querySelector('.jersey') as HTMLElement).style.background = hexCss(look.jersey);
    (preview.querySelector('.pants') as HTMLElement).style.background = hexCss(look.pants);
    root.querySelectorAll<HTMLButtonElement>('.swatch-btn').forEach((btn) => {
      const on = Number(btn.dataset.color) === look[btn.dataset.part as 'jersey'];
      btn.classList.toggle('on', on);
    });
    root.querySelectorAll<HTMLInputElement>('input[type="color"]').forEach((input) => {
      const key = input.dataset.part as 'jersey';
      input.value = hexCss(look[key]);
    });
    root.querySelectorAll<HTMLButtonElement>('.skin-btn').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.skin === look.skin);
    });
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.classList.contains('swatch-btn')) {
      const key = t.dataset.part as 'jersey';
      opts.onChange({ ...loadLook(), [key]: Number(t.dataset.color) });
    }
    if (t.classList.contains('skin-btn')) {
      opts.onChange({ ...loadLook(), skin: t.dataset.skin === 'dark' ? 'dark' : 'light' });
    }
  });
  root.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.type !== 'color') return;
    const key = t.dataset.part as 'jersey';
    opts.onChange({ ...loadLook(), [key]: parseInt(t.value.slice(1), 16) });
  });
  addEventListener('tdfb-look', paint);
  paint();
  return { refresh: paint };
}

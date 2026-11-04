"""Pack FootballTheater masks, number fonts, fantasy logos, and presets.

Official NFL and school marks are skipped. Hair and beard meshes that point at
the missing Little Heroes pack are recorded and not copied.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from PIL import Image

SRC = Path(os.environ.get('THEATER_SRC', '/tmp/ft'))
ROOT = SRC / 'ChainLink.Football'
OUT = Path('/workspace/public/theater')
DATA = Path('/workspace/src/data')

SKIP_LOGO_NAMES = {
    'Logo-Broncos', 'Logo-Broncos-Color', 'Logo-Bucs-Base', 'Logo-Bucs-Color',
    'Logo-Jaguars-Base', 'Logo-Jaguars-Color', 'Logo-Knights-Base', 'Logo-Knights-Color',
    'Logo-Stripes', 'Logo-StripesColor', 'Logo-Wings', 'Logo-WingsColor',
}


def guid_map() -> dict[str, Path]:
    found: dict[str, Path] = {}
    for meta in SRC.rglob('*.meta'):
        text = meta.read_text(errors='ignore')
        match = re.search(r'^guid: ([0-9a-f]+)', text, re.M)
        if match:
            found[match.group(1)] = meta.with_suffix('')
    return found


GUIDS = guid_map()


def hex_color(c: dict) -> str:
    r = max(0, min(255, round(float(c.get('r', 0)) * 255)))
    g = max(0, min(255, round(float(c.get('g', 0)) * 255)))
    b = max(0, min(255, round(float(c.get('b', 0)) * 255)))
    return f'#{r:02x}{g:02x}{b:02x}'


def save_resized(src: Path, dest: Path, size: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGBA')
    if max(im.size) > size:
        im.thumbnail((size, size), Image.Resampling.BOX)
    im.save(dest, optimize=True)


def channel(im: Image.Image, index: int) -> Image.Image:
    bands = im.convert('RGBA').split()
    return bands[index]


def pack_masks() -> None:
    cloth = ROOT / 'Images/Clothing'
    skin = channel(Image.open(ROOT / 'Skin-Color.png'), 0)
    jersey = channel(Image.open(cloth / 'Jerseys/Jersey-Color.png'), 0)
    pants = channel(Image.open(cloth / 'Pants/Pants-Color.png'), 2)
    socks = channel(Image.open(cloth / 'Clothing-Socks-Color.png'), 0)
    masks = Image.merge('RGBA', (jersey, pants, skin, socks)).resize((1024, 1024), Image.Resampling.BOX)
    # R jersey, G pants, B skin, A socks. Shader below matches this order.
    masks.save(OUT / 'masks.png', optimize=True)

    jshade = channel(Image.open(cloth / 'Jerseys/Jersey-Base.png'), 0)
    pshade = channel(Image.open(cloth / 'Pants/Pants-Base.png'), 0)
    shoes = channel(Image.open(cloth / 'Clothing-Shoes-Color.png'), 0)
    shoe_shade = channel(Image.open(cloth / 'Clothing-Shoes.png'), 0)
    shade = Image.merge('RGBA', (jshade, pshade, shoes, shoe_shade)).resize((1024, 1024), Image.Resampling.BOX)
    shade.save(OUT / 'shade.png', optimize=True)

    def copy_details(folder: Path, dest: Path, prefix: str) -> list[str]:
        ids = []
        for png in sorted(folder.glob('*.png')):
            name = png.stem
            if not name.startswith(prefix):
                continue
            pid = name[len(prefix):]
            if pid.endswith('-Color') or 'Base' in pid or pid == 'Color':
                continue
            save_resized(png, dest / f'{pid}.png', 512)
            ids.append(pid)
        return ids

    jersey_ids = copy_details(cloth / 'Jerseys', OUT / 'jersey', 'Jersey-Detail-Color-')
    pants_ids = copy_details(cloth / 'Pants', OUT / 'pants', 'Pants-Detail-')
    return jersey_ids, pants_ids


def pack_helmet() -> list[str]:
    h = ROOT / 'Helmet'
    save_resized(h / 'Helmet-Base.png', OUT / 'helmet/base.png', 512)
    save_resized(h / 'Helmet-Base-Color.png', OUT / 'helmet/color.png', 512)
    save_resized(h / 'Helmet-Details-Holes.png', OUT / 'helmet/holes.png', 512)
    ids = []
    for png, pid in [
        ('Helmet-Details-A.png', 'A'),
        ('Helmet-Details-A1.png', 'A1'),
        ('Helmet-Details-Color.png', 'color'),
        ('Helmet-Details-OneStripe.png', 'stripe'),
        ('Helmet-Details-Sword.png', 'sword'),
    ]:
        save_resized(h / png, OUT / 'helmet' / f'{pid}.png', 512)
        ids.append(pid)
    return ids


def pack_numbers() -> list[str]:
    fonts = []
    numbers = ROOT / 'Images/Numbers'
    for folder in sorted(p for p in numbers.iterdir() if p.is_dir()):
        glyphs = sorted(folder.glob('*-*.png'))
        shapes = []
        for png in glyphs:
            if 'color' in png.stem.lower():
                continue
            match = re.search(r'(?:_|-)(\d)$', png.stem)
            if not match:
                continue
            shapes.append((match.group(1), png))
        if len(shapes) < 10:
            continue
        fonts.append(folder.name)
        for digit, png in shapes:
            save_resized(png, OUT / 'numbers' / folder.name / f'{digit}.png', 256)
    return fonts


def pack_logos() -> dict[str, str]:
    """guid of a TextureColorPair asset or png -> public file id."""
    logos: dict[str, str] = {}
    fantasy = ROOT / 'Images/Logos/Fantasy'
    for png in fantasy.glob('*.png'):
        if png.stem in SKIP_LOGO_NAMES or png.stem.endswith('-Color') or png.stem.endswith('_Color'):
            continue
        # Prefer the plain mark. Color maps are optional and often the same art.
        save_resized(png, OUT / 'logos' / f'{png.stem}.png', 256)
        meta = png.with_suffix(png.suffix + '.meta')
        guid = re.search(r'^guid: ([0-9a-f]+)', meta.read_text(), re.M).group(1)
        logos[guid] = png.stem
    for asset in fantasy.glob('*.asset'):
        text = asset.read_text(errors='ignore')
        tex = re.search(r'Texture: \{fileID: \d+, guid: ([0-9a-f]+)', text)
        meta = asset.with_suffix(asset.suffix + '.meta')
        ag = re.search(r'^guid: ([0-9a-f]+)', meta.read_text(), re.M)
        if tex and ag and tex.group(1) in logos:
            logos[ag.group(1)] = logos[tex.group(1)]
    return logos


def pattern_from_guid(guid: str | None, kind: str) -> str:
    if not guid:
        return ''
    path = GUIDS.get(guid)
    if not path:
        return ''
    stem = path.stem
    if kind == 'jersey':
        prefix = 'Jersey-Detail-Color-'
    elif kind == 'pants':
        prefix = 'Pants-Detail-'
    else:
        table = {
            'Helmet-Details-A': 'A',
            'Helmet-Details-A1': 'A1',
            'Helmet-Details-Color': 'color',
            'Helmet-Details-OneStripe': 'stripe',
            'Helmet-Details-Sword': 'sword',
            'Helmet-Details-Holes': 'holes',
        }
        return table.get(stem, '')
    if stem.startswith(prefix):
        return stem[len(prefix):]
    return ''


def font_from_guid(guid: str | None) -> str:
    if not guid:
        return ''
    path = GUIDS.get(guid)
    if not path:
        return ''
    if path.parent.name and (path.parent / f'{path.parent.name}-0.png').exists():
        return path.parent.name
    if path.is_dir():
        return ''
    return path.parent.name if (OUT / 'numbers' / path.parent.name).exists() else ''


def ref_guid(node) -> str | None:
    if not isinstance(node, str):
        return None
    match = re.search(r'guid: ([0-9a-f]+)', node)
    return match.group(1) if match else None


def parse_uniforms(text: str, team_colors: dict[str, str], logos: dict[str, str]) -> tuple[dict, list[dict], str | None]:
    logo = None
    logo_match = re.search(r'HelmetLogo: \{fileID: [^,]+, guid: ([0-9a-f]+)', text)
    if logo_match:
        logo = logos.get(logo_match.group(1))
    blocks = re.split(r'\n    - <Name>k__BackingField: ', text)
    # DefaultUniform is inline before the list.
    default_chunk = text.split('DefaultUniform:', 1)[1].split('\n    Uniforms:', 1)[0]
    uniforms = [parse_uniform('Default\n' + default_chunk, team_colors, logos, default=True)]
    if len(blocks) > 1:
        for chunk in blocks[1:]:
            uniforms.append(parse_uniform(chunk, team_colors, logos, default=False))
    return logo, uniforms


def parse_uniform(chunk: str, team_colors: dict[str, str], logos: dict[str, str], default: bool) -> dict:
    def grab(key: str, cast=str):
        match = re.search(rf'{key}: (.+)', chunk)
        if not match:
            return None
        raw = match.group(1).strip()
        return cast(raw) if cast is not str else raw

    def color_field(slot_key: str, custom_key: str) -> str:
        slot = int(grab(slot_key, int) or 0)
        custom = re.search(
            rf'{custom_key}: \{{r: ([0-9.]+), g: ([0-9.]+), b: ([0-9.]+)',
            chunk,
        )
        custom_c = {'r': 1, 'g': 1, 'b': 1}
        if custom:
            custom_c = {'r': float(custom.group(1)), 'g': float(custom.group(2)), 'b': float(custom.group(3))}
        if slot >= 3:
            return hex_color(custom_c)
        return [team_colors['primary'], team_colors['secondary'], team_colors['tertiary']][max(0, min(2, slot))]

    name = 'Default' if default else chunk.split('\n', 1)[0].strip()
    font_guid = ref_guid(grab('Font') or '')
    jersey_guid = ref_guid(grab('JerseyDetail') or '')
    pants_guid = ref_guid(grab('PantsDetail') or '')
    helmet_guid = ref_guid(grab('HelmetDetail') or '')
    alt = ref_guid(grab('AlternateLogo') or '')
    return {
        'id': name,
        'name': name,
        'helmet': color_field('HelmetColorBase', 'CustomHelmetColorBase'),
        'facemask': color_field('HelmetColorFace', 'CustomHelmetColorFace'),
        'helmetR': color_field('HelmetColorR', 'CustomHelmetColorR'),
        'helmetG': color_field('HelmetColorG', 'CustomHelmetColorG'),
        'helmetB': color_field('HelmetColorB', 'CustomHelmetColorB'),
        'helmetPattern': pattern_from_guid(helmet_guid, 'helmet'),
        'jersey': color_field('JerseyColorR', 'CustomJerseyColorR'),
        'jerseyG': color_field('JerseyColorG', 'CustomJerseyColorG'),
        'jerseyB': color_field('JerseyColorB', 'CustomJerseyColorB'),
        'jerseyPattern': pattern_from_guid(jersey_guid, 'jersey'),
        'pants': color_field('PantsColorB', 'CustomPantsColorB'),
        'pantsR': color_field('PantsColorR', 'CustomPantsColorR'),
        'pantsG': color_field('PantsColorG', 'CustomPantsColorG'),
        'pantsPattern': pattern_from_guid(pants_guid, 'pants'),
        'font': font_from_guid(font_guid),
        'logo': logos.get(alt) if alt else None,
    }


def parse_teams(logos: dict[str, str]) -> list[dict]:
    teams = []
    folder = ROOT / 'ScriptableObjects/Teams/Fantasy'
    for asset in sorted(folder.glob('*.asset')):
        text = asset.read_text(errors='ignore')
        name = re.search(r'<Name>k__BackingField: (.+)', text).group(1).strip()
        colors = {}
        for key, label in [('PrimaryColor', 'primary'), ('SecondaryColor', 'secondary'), ('TertiaryColor', 'tertiary')]:
            match = re.search(rf'{key}: \{{r: ([0-9.]+), g: ([0-9.]+), b: ([0-9.]+)', text)
            colors[label] = hex_color({'r': float(match.group(1)), 'g': float(match.group(2)), 'b': float(match.group(3))})
        logo, uniforms = parse_uniforms(text, colors, logos)
        teams.append({
            'id': name,
            'name': name,
            'primary': colors['primary'],
            'secondary': colors['secondary'],
            'tertiary': colors['tertiary'],
            'logo': logo,
            'uniforms': uniforms,
        })
    return teams


def parse_players() -> list[dict]:
    data = json.loads((SRC / 'SavedCustomData/Players/Players.dat').read_text())
    players = []
    for entry in data.values():
        value = entry['value']
        skin = value.get('SkinColor') or {}
        usable = float(skin.get('a', 0)) > 0.2 and (skin.get('r', 0) + skin.get('g', 0) + skin.get('b', 0)) > 0.05
        hair = value.get('HairObject') or {}
        face = value.get('FacialHairObject') or {}
        players.append({
            'id': value.get('<Id>k__BackingField'),
            'name': value.get('<Name>k__BackingField') or 'Player',
            'number': int(value.get('Number') or 0),
            'skin': hex_color(skin) if usable else None,
            'hairRef': hair.get('_ES3Ref'),
            'facialHairRef': face.get('_ES3Ref'),
            'hairColor': hex_color(value.get('HairColor') or {'r': 0, 'g': 0, 'b': 0}),
            'facialHairColor': hex_color(value.get('FacialHairColor') or {'r': 0, 'g': 0, 'b': 0}),
        })
    return players


def missing_cosmetics() -> list[dict]:
    rows = []
    cos = ROOT / 'Player Cosmetics'
    for prefab in sorted(cos.rglob('*.prefab')):
        text = prefab.read_text(errors='ignore')
        refs = re.findall(r'm_Mesh: \{fileID: (-?\d+), guid: ([0-9a-f]+)', text)
        rel = str(prefab.relative_to(cos))
        if not refs:
            fbx = re.findall(r'guid: ([0-9a-f]{32})', text)
            local = [g for g in fbx if GUIDS.get(g) and GUIDS[g].suffix.lower() == '.fbx']
            rows.append({
                'prefab': rel,
                'status': 'local' if local else 'unresolved',
                'guid': local[0] if local else None,
                'fileID': None,
                'note': 'Stash1.fbx is in the export' if local else 'no mesh reference',
            })
            continue
        for file_id, guid in refs:
            src = GUIDS.get(guid)
            rows.append({
                'prefab': rel,
                'status': 'missing',
                'guid': guid,
                'fileID': int(file_id),
                'note': 'Little Heroes Mega Pack mesh is not in the export' if not src else str(src),
            })
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    jersey_ids, pants_ids = pack_masks()
    helmet_ids = pack_helmet()
    fonts = pack_numbers()
    logos = pack_logos()
    teams = parse_teams(logos)
    players = parse_players()
    missing = missing_cosmetics()
    payload = {
        'teams': teams,
        'players': players,
        'fonts': fonts,
        'jerseyPatterns': jersey_ids,
        'pantsPatterns': pants_ids,
        'helmetPatterns': helmet_ids,
        'beards': ['stash'],
        'missingCosmetics': missing,
        'skippedThirdParty': [
            'Images/Logos/Logo-Broncos*, Logo-Bucs*, Logo-Jaguars* are league marks and were not copied.',
            'Images/Logos/Logo-Knights* looks like a school mark and was not copied.',
            'Images/Logos/Logo-Stripes* and Logo-Wings* have an unclear origin and were not copied.',
            'ScriptableObjects/Teams/Jaguars.asset and UCF.asset were not imported.',
            'Hair 01-22 and Beard 01-04 reference the Little Heroes Mega Pack, which is not included.',
        ],
    }
    (DATA / 'theater.json').write_text(json.dumps(payload, indent=2))
    print('teams', len(teams), 'players', len(players), 'fonts', len(fonts))
    print('jersey', jersey_ids)
    print('pants', pants_ids)
    print('helmet', helmet_ids)
    print('missing', [m for m in missing if m['status'] == 'missing'].__len__())
    print('bytes', (DATA / 'theater.json').stat().st_size)


if __name__ == '__main__':
    main()

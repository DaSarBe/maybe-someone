const ASSET_BASE = import.meta.env.BASE_URL + 'assets/';

interface CreditEntry {
  text: string;
  link?: { label: string; href: string };
  license: string;
}

/** 必須署名的素材（CC BY）。這份清單內建，離線或 CREDITS.md 讀不到時也一定會顯示 */
export const REQUIRED_CREDITS: CreditEntry[] = [
  {
    text: 'Rifle gunshot sounds by Vincent Sevedge, licensed under CC BY 3.0',
    link: { label: 'https://opengameart.org/content/gunshot-sounds', href: 'https://opengameart.org/content/gunshot-sounds' },
    license: 'https://creativecommons.org/licenses/by/3.0/',
  },
];

/** 不需署名（CC0），列出來表示感謝 */
export const THANKS: { who: string; what: string; href: string }[] = [
  { who: 'Kenney', what: 'Impact Sounds / Sci-fi Sounds / Interface Sounds', href: 'https://kenney.nl' },
  { who: 'Quaternius', what: '3D models', href: 'https://quaternius.com' },
  { who: 'Screaming Brain Studios', what: 'Surface textures', href: 'https://opengameart.org/content/base-material-texture-pack' },
  { who: 'kurt', what: 'Gunshots (pistol)', href: 'https://opengameart.org/content/gunshots' },
  { who: 'rubberduck', what: '100 CC0 SFX (footsteps, stones)', href: 'https://opengameart.org/content/100-cc0-sfx-2' },
  { who: 'TinyWorlds', what: 'Different steps (gravel)', href: 'https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud' },
  { who: 'Peludo', what: 'Sand footsteps', href: 'https://opengameart.org/content/water-splash-and-sand-footsteps' },
  { who: 'SpringySpringo', what: 'Gun reload sounds', href: 'https://opengameart.org/content/gun-reload-sounds' },
  { who: 'zer0_sol', what: 'Handgun reload sound', href: 'https://opengameart.org/content/handgun-reload-sound-effect' },
  { who: 'SketchMan3', what: 'Wind whoosh loop', href: 'https://opengameart.org/content/wind-whoosh-loop' },
  { who: 'Fun Gi Development', what: 'Sci-fi ambience SFX', href: 'https://opengameart.org/content/sci-fi-ambience-sfx' },
];

function link(href: string, label: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** 製作名單面板：必須署名的素材 + CC0 感謝清單 + 讀取 CREDITS.md 的完整來源表 */
export class Credits {
  readonly el = document.createElement('div');
  private full = document.createElement('pre');
  private loaded = false;

  constructor(onBack: () => void) {
    this.el.className = 'credits hidden';

    const title = document.createElement('h2');
    title.textContent = '製作名單';

    const req = document.createElement('section');
    const reqH = document.createElement('h3');
    reqH.textContent = '需要署名的素材 (Attribution required)';
    req.append(reqH);
    for (const c of REQUIRED_CREDITS) {
      const p = document.createElement('p');
      p.className = 'credits-required';
      p.append(c.text);
      if (c.link) p.append(document.createElement('br'), link(c.link.href, c.link.label));
      p.append(document.createElement('br'), link(c.license, c.license));
      req.append(p);
    }

    const thanks = document.createElement('section');
    const thH = document.createElement('h3');
    thH.textContent = '感謝 (CC0 素材)';
    const ul = document.createElement('ul');
    for (const t of THANKS) {
      const li = document.createElement('li');
      li.append(link(t.href, t.who), ` — ${t.what}`);
      ul.append(li);
    }
    thanks.append(thH, ul);

    const fullSec = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = '完整素材來源與授權 (CREDITS.md)';
    this.full.className = 'credits-full';
    this.full.textContent = '載入中…';
    fullSec.append(sum, this.full);
    fullSec.addEventListener('toggle', () => { if (fullSec.open) void this.load(); });

    const back = document.createElement('button');
    back.className = 'menu-btn';
    back.textContent = '返回';
    back.addEventListener('click', onBack);

    this.el.append(title, req, thanks, fullSec, back);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const res = await fetch(ASSET_BASE + 'CREDITS.md');
      if (!res.ok) throw new Error(String(res.status));
      this.full.textContent = await res.text();
      this.loaded = true;
    } catch {
      this.full.textContent = '(無法載入 CREDITS.md；上方為必須署名的素材。)';
    }
  }

  show(v: boolean): void {
    this.el.classList.toggle('hidden', !v);
  }
}

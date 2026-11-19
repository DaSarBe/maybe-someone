import { CURRENCY_SYMBOL } from '../data/items';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export const fmtCredits = (n: number): string => `${CURRENCY_SYMBOL}${Math.round(n).toLocaleString('en-US')}`;
export const fmtKg = (n: number): string => `${n.toFixed(1)} kg`;
export const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

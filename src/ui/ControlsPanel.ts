import type { Game } from '../core/Game';
import type { AssistLevel, ControlSettings, GyroMode, HoldMode } from '../settings/ControlSettings';
import { GYRO_SENS_MAX, GYRO_SENS_MIN, SENS_MAX, SENS_MIN } from '../settings/ControlSettings';
import type { GyroPermission } from '../input/Gyro';
import { btn, el } from './dom';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 分段選擇（互斥按鈕） */
function seg<T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void): HTMLElement {
  const wrap = el('div', 'ctl-seg');
  const buttons = new Map<T, HTMLButtonElement>();
  const refresh = () => { for (const [v, b] of buttons) b.classList.toggle('on', v === get()); };
  for (const [v, label] of opts) {
    const b = btn(label, () => { set(v); refresh(); });
    b.classList.add('seg-btn');
    buttons.set(v, b);
    wrap.appendChild(b);
  }
  refresh();
  return wrap;
}

function slider(label: string, min: number, max: number, get: () => number, set: (v: number) => void): HTMLElement {
  const row = el('label', 'menu-row wide');
  const input = el('input');
  input.type = 'range';
  input.min = String(Math.round(min * 100)); input.max = String(Math.round(max * 100)); input.step = '5';
  input.value = String(Math.round(get() * 100));
  const out = el('output', '', pct(get()));
  input.addEventListener('input', () => { const v = Number(input.value) / 100; out.textContent = pct(v); set(v); });
  row.append(el('span', '', label), input, out);
  return row;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const r = el('div', 'ctl-row');
  r.append(el('span', 'ctl-label', label), control);
  return r;
}

/** 「操作設定」頁：靈敏度、陀螺儀、按鍵模式、左側射擊鍵、輔助瞄準。設定即時生效並存檔。 */
export function buildControlsPanel(game: Game, onBack: () => void): HTMLElement {
  const root = el('div', 'ctl-panel');
  const st = game.controls;
  const cfg = (): ControlSettings => st.get();
  const upd = (m: (c: ControlSettings) => void) => st.update(m);
  const touch = game.isTouch;

  const head = el('div', 'ctl-head');
  head.append(btn('‹ 返回', onBack, 'sm'), el('h2', '', '操作設定'), btn('恢復預設', () => { st.reset(); rebuild(); }, 'sm'));
  const body = el('div', 'ctl-body');
  root.append(head, body);

  const unsub: (() => void)[] = [];
  const rebuild = () => {
    unsub.splice(0).forEach((u) => u());
    body.replaceChildren(...sections());
  };

  const sections = (): HTMLElement[] => {
    const out: HTMLElement[] = [];

    // ---- 靈敏度 ----
    const sens = el('section', 'ctl-sec');
    sens.append(el('h3', '', '視角靈敏度'));
    sens.append(
      slider('觸控：轉視角', SENS_MIN, SENS_MAX, () => cfg().sens.touchLook, (v) => upd((c) => { c.sens.touchLook = v; })),
      slider('觸控：瞄準時', SENS_MIN, SENS_MAX, () => cfg().sens.touchAim, (v) => upd((c) => { c.sens.touchAim = v; })),
      slider('滑鼠：轉視角', SENS_MIN, SENS_MAX, () => cfg().sens.mouseLook, (v) => upd((c) => { c.sens.mouseLook = v; })),
      slider('滑鼠：瞄準時', SENS_MIN, SENS_MAX, () => cfg().sens.mouseAim, (v) => upd((c) => { c.sens.mouseAim = v; })),
    );
    out.push(sens);

    // ---- 按鍵模式 ----
    const modes = el('section', 'ctl-sec');
    modes.append(el('h3', '', '按鍵模式（手機與電腦通用）'));
    const hold: [HoldMode, string][] = [['hold', '按住'], ['toggle', '點一下切換']];
    modes.append(
      row('蹲下（C / 蹲鍵）', seg(hold, () => cfg().crouchMode, (v) => upd((c) => { c.crouchMode = v; }))),
      row('瞄準（右鍵 / 瞄準鍵）', seg(hold, () => cfg().aimMode, (v) => upd((c) => { c.aimMode = v; }))),
    );
    out.push(modes);

    // ---- 輔助瞄準 / 左射擊鍵 ----
    const aid = el('section', 'ctl-sec');
    aid.append(el('h3', '', '手機輔助'));
    const assist: [AssistLevel, string][] = [['off', '關'], ['weak', '弱'], ['standard', '標準']];
    aid.append(
      row('輔助瞄準（準心在敵人身上時減速）', seg(assist, () => cfg().assist, (v) => upd((c) => { c.assist = v; }))),
      row('左側射擊鍵', seg<'on' | 'off'>([['on', '開'], ['off', '關']], () => (cfg().leftFire ? 'on' : 'off'), (v) => upd((c) => { c.leftFire = v === 'on'; }))),
    );
    out.push(aid);

    // ---- 陀螺儀（只有手機） ----
    if (touch && game.gyro) {
      const gy = game.gyro;
      const sec = el('section', 'ctl-sec');
      sec.append(el('h3', '', '陀螺儀瞄準'));
      const status = el('p', 'ctl-note');
      const grantBtn = btn('授權動作與方向感測', () => { void gy.requestPermission(); }, 'sm primary');
      const showStatus = () => {
        const p: GyroPermission = gy.permission;
        const on = cfg().gyro.mode !== 'off';
        grantBtn.classList.toggle('hidden', !(gy.needsPermission && p !== 'granted'));
        status.classList.toggle('warn', p === 'denied' || p === 'unsupported');
        if (p === 'unsupported') status.textContent = '這個裝置或瀏覽器不支援陀螺儀。';
        else if (p === 'denied') status.textContent = '已被拒絕。請到「設定 → App → Safari → 進階 → 動作與方向存取」開啟，完全關閉 Safari 後重新開啟遊戲，再按上面的授權鈕。';
        else if (p === 'granted') status.textContent = on ? '陀螺儀已啟用。轉動手機即可微調準心。' : '已授權。選擇「只在瞄準時」或「永遠開啟」即可使用。';
        else status.textContent = gy.needsPermission ? '需要授權：選擇模式或按授權鈕時，系統會詢問「動作與方向存取」，請按「允許」。' : '選擇模式後，轉動手機就會有反應；若沒反應，請確認瀏覽器允許動作感測器。';
      };
      unsub.push(gy.onChange(showStatus));
      const modeSeg = seg<GyroMode>(
        [['off', '關閉'], ['aim', '只在瞄準時'], ['always', '永遠開啟']],
        () => cfg().gyro.mode,
        (v) => {
          upd((c) => { c.gyro.mode = v; });
          // 必須在這次點擊中呼叫（iOS 的授權限制）
          if (v !== 'off' && gy.permission !== 'granted') void gy.requestPermission();
          showStatus();
        },
      );
      sec.append(
        row('模式', modeSeg),
        slider('陀螺儀靈敏度', GYRO_SENS_MIN, GYRO_SENS_MAX, () => cfg().gyro.sens, (v) => upd((c) => { c.gyro.sens = v; })),
        row('反向', seg<'none' | 'x' | 'y' | 'xy'>(
          [['none', '不反向'], ['x', 'X 軸'], ['y', 'Y 軸'], ['xy', 'X + Y']],
          () => `${cfg().gyro.invertX ? 'x' : ''}${cfg().gyro.invertY ? 'y' : ''}` as 'none' | 'x' | 'y' | 'xy' || 'none',
          (v) => upd((c) => { c.gyro.invertX = v === 'x' || v === 'xy'; c.gyro.invertY = v === 'y' || v === 'xy'; }),
        )),
        status, grantBtn,
      );
      showStatus();
      out.push(sec);
    }
    return out;
  };

  rebuild();
  return root;
}

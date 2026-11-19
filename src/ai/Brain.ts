import * as THREE from 'three';

/** 巡邏 → 警戒（調查可疑處）→ 追擊 → 攻擊 → 搜索 → 回到巡邏；dead 為終點 */
export type AiState = 'patrol' | 'alert' | 'chase' | 'attack' | 'search' | 'dead';

export interface BrainConfig {
  /** 警戒狀態最久持續秒數 */
  alertMax: number;
  /** 到達調查點後停留秒數 */
  alertWait: number;
  /** 追擊中失去目標多久後轉搜索 */
  loseTime: number;
  /** 搜索持續秒數 */
  searchTime: number;
  /** 攻擊中失去視線多久後轉追擊 */
  attackLoseTime: number;
}

export const DEFAULT_BRAIN: BrainConfig = { alertMax: 14, alertWait: 3, loseTime: 3.5, searchTime: 12, attackLoseTime: 1.0 };

export interface BrainInput {
  /** 這個 tick 是否看得見目標（視野、視距、視線都通過） */
  canSee: boolean;
  /** 發現值每秒增量（看不見時 0） */
  gain: number;
  targetPos: THREE.Vector3;
  dist: number;
  /** 想要進入攻擊的距離上限 */
  engageRange: number;
  /** 已走到調查點 */
  arrived: boolean;
}

const ALERT_THRESHOLD = 0.25;
const AWARENESS_DECAY = 0.3;

/**
 * 敵人的決策核心（純邏輯，不依賴場景）。外部把感知結果餵進來，
 * 它決定目前狀態；移動、開槍、動畫由 Enemy 依狀態執行。
 */
export class EnemyBrain {
  state: AiState = 'patrol';
  /** 發現值 0..1 */
  awareness = 0;
  stateTime = 0;
  /** 最後一次知道目標的位置 */
  readonly lastKnown = new THREE.Vector3();
  hasLastKnown = false;
  /** 警戒時要調查的位置 */
  readonly investigate = new THREE.Vector3();
  hasInvestigate = false;
  /** 這個 tick 剛進入戰鬥（Enemy 據此通知群組） */
  justSpotted = false;
  private lostTime = 0;
  private waited = 0;

  constructor(private cfg: BrainConfig = DEFAULT_BRAIN) {}

  get engaged(): boolean { return this.state === 'chase' || this.state === 'attack'; }
  get alive(): boolean { return this.state !== 'dead'; }

  private enter(s: AiState): void {
    this.state = s;
    this.stateTime = 0;
    this.lostTime = 0;
    this.waited = 0;
  }

  /** 聽到聲音：巡邏 / 搜索中變成警戒並前往聲源；已警戒者更新調查點；戰鬥中不理會 */
  hear(pos: THREE.Vector3): void {
    if (this.state === 'dead' || this.engaged) return;
    this.investigate.copy(pos);
    this.hasInvestigate = true;
    this.awareness = Math.max(this.awareness, ALERT_THRESHOLD + 0.05);
    if (this.state !== 'alert') this.enter('alert');
    else { this.stateTime = 0; this.waited = 0; }
  }

  /** 被打中：立刻知道玩家的位置，進入追擊 */
  damaged(attackerPos: THREE.Vector3): void {
    if (this.state === 'dead') return;
    this.lastKnown.copy(attackerPos);
    this.hasLastKnown = true;
    this.awareness = 1;
    if (!this.engaged) { this.enter('chase'); this.justSpotted = true; }
  }

  /** 同群組的人發現玩家了 */
  groupAlert(pos: THREE.Vector3): void {
    if (this.state === 'dead' || this.engaged) return;
    this.lastKnown.copy(pos);
    this.hasLastKnown = true;
    this.awareness = 1;
    this.enter('chase');
  }

  kill(): void {
    this.enter('dead');
    this.awareness = 0;
  }

  private spotted(inp: BrainInput): void {
    this.awareness = 1;
    this.enter(inp.canSee && inp.dist <= inp.engageRange ? 'attack' : 'chase');
    this.justSpotted = true;
  }

  update(dt: number, inp: BrainInput): void {
    if (this.state === 'dead') return;
    this.stateTime += dt;
    if (inp.canSee) {
      this.lastKnown.copy(inp.targetPos);
      this.hasLastKnown = true;
    }
    if (!this.engaged) {
      if (inp.canSee) this.awareness = Math.min(1, this.awareness + inp.gain * dt);
      else this.awareness = Math.max(0, this.awareness - AWARENESS_DECAY * dt);
    }

    switch (this.state) {
      case 'patrol':
        if (this.awareness >= 1) this.spotted(inp);
        else if (this.awareness >= ALERT_THRESHOLD) {
          if (inp.canSee) { this.investigate.copy(inp.targetPos); this.hasInvestigate = true; }
          this.enter('alert');
        }
        break;
      case 'alert':
        if (inp.canSee) { this.investigate.copy(inp.targetPos); this.hasInvestigate = true; }
        if (this.awareness >= 1) { this.spotted(inp); break; }
        if (inp.arrived) this.waited += dt;
        if ((this.waited >= this.cfg.alertWait && this.awareness < ALERT_THRESHOLD + 0.05) || this.stateTime >= this.cfg.alertMax) {
          this.hasInvestigate = false;
          this.awareness = Math.min(this.awareness, 0.2);
          this.enter('patrol');
        }
        break;
      case 'chase':
        if (inp.canSee && inp.dist <= inp.engageRange) { this.enter('attack'); break; }
        if (inp.canSee) this.lostTime = 0;
        else {
          this.lostTime += dt;
          if (this.lostTime >= this.cfg.loseTime) { this.enter('search'); this.awareness = 0.5; }
        }
        break;
      case 'attack':
        if (!inp.canSee) {
          this.lostTime += dt;
          if (this.lostTime >= this.cfg.attackLoseTime) this.enter('chase');
        } else {
          this.lostTime = 0;
          if (inp.dist > inp.engageRange * 1.25) this.enter('chase');
        }
        break;
      case 'search':
        if (this.awareness >= 1) this.spotted(inp);
        else if (this.stateTime >= this.cfg.searchTime) { this.awareness = 0; this.enter('patrol'); }
        break;
    }
  }

  /** Enemy 取走「剛發現」旗標 */
  consumeSpotted(): boolean {
    const j = this.justSpotted;
    this.justSpotted = false;
    return j;
  }
}

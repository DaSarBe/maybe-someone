# 時晶行動 Chrono Raid — 設計文件（Opus 規劃）

> 3D 第一人稱「搜打撤」網頁遊戲。單人可玩，之後擴充伺服器連線（第二階段）。
> 支援電腦（鍵鼠）與手機（觸控）。

## 1. 世界觀

- 未來世界科技高度發達，但關鍵能源原料「**時晶（Chronite）**」已經耗盡，人類無法人工合成。
- 各大企業各自發明時光機，派「**穿越者**」回到過去取回時晶。
- 每張地圖是一個不同的時代。
- **時空穩定度**：在過去停留時穩定度持續下降，歸零就被時空亂流吞噬（死亡，身上物品全失）。這就是撤離倒數。
- 敵人：①過去世界的守衛 ②其他企業的穿越者（第一階段是 AI，第二階段是真人）。

## 2. 核心循環

```
[未來基地 Hub] 買裝備/升級 → 選擇攜帶物（武器、補給、要拿去過去交易的未來商品）
      ↓ 時光機出發（選擇時代地圖）
[過去 Raid] 搜刮容器/擊敗敵人 → 拿到時晶、古董、物資 → 在穩定度歸零前抵達撤離點
      ↓ 成功撤離：帶回所有物品 / 死亡：失去身上所有物品（保險箱物品不受影響）
[未來基地] 賣掉古董與時晶換錢 → 循環
```

- **未來商品**：在 Hub 用錢買（例如電池、藥品、晶片），帶到過去賣給「時代商人」NPC 換取當地貨幣或古董，因此出發前要在「戰力」和「貨物」之間取捨。
- **古董**：過去的物品帶回未來價值大增。

## 3. 階段規劃

### 第一階段（目前）：單機核心
- M1 引擎核心：Vite + TS + Three.js、遊戲迴圈、第一人稱控制器、碰撞、鍵鼠與觸控輸入、灰盒測試場景
- M2 音效系統：依地面材質發出不同腳步聲、依空間（室內/室外/隧道）調整槍聲回音、區域環境音
- M3 物品與經濟：物品資料、背包（重量＋格數）、倉庫、商店、存檔（SaveService 介面，先用 localStorage）
- M4 Raid 流程：第一張時代地圖、搜刮容器、穩定度倒數、撤離點、AI 敵人、戰鬥（hitscan 槍械、血量、護甲、彈藥、換彈）
- M5 素材整合與打磨、手機實機調整

### 第二階段：連線
- Node.js + Colyseus（或 WebSocket）權威伺服器、帳號、PvPvE 對局
- **基地入侵**：離線時其他玩家可入侵房間搶裝備；保險箱物品受保護；可佈置陷阱/砲塔
- 更多時代地圖、企業陣營、排行榜

## 4. 技術架構

- **建置**：Vite + TypeScript（strict）
- **3D**：three（npm），碰撞使用 `three/examples/jsm/math/Octree.js` + `Capsule.js`
- **音效**：Web Audio API，自寫 AudioManager（不額外依賴函式庫），素材缺少時使用程式合成的替代聲音
- **美術**：Low Poly，CC0 素材（來源記在 `public/assets/CREDITS.md`）
- **網頁 UI**：純 DOM + CSS 覆蓋在 canvas 上（HUD、選單），不使用框架

### 音效載入與音效精靈圖（audio sprite）
- `public/assets/sounds/` 是素材原檔（對應 CREDITS）；`manifest.json` 是唯一的素材清單。**執行時讀的是 `public/assets/sprites/`**：
  `scripts/build-audio-sprites.mjs` 依 manifest 把音檔依優先順序串成三組（p0 腳步與介面、p1 武器與命中與特效、p2 環境音），
  每段之間留 50ms 靜音，輸出 `<group>.ogg`（Vorbis）、`<group>.m4a`（AAC）與 `<group>.json`（每個片段的 key、index、offset、duration）。
- **改動音效素材（或 manifest）後必須執行 `npm run build:audio`（需要 ffmpeg），並把 `public/assets/sprites/` 一起 commit**（GitHub Actions 不一定有 ffmpeg）。
  有單元測試檢查 sprite 與 manifest 是否一致。
- 載入流程：`index.html` 最早就開始抓 p0；`AudioManager` 在建立時就用 `OfflineAudioContext` 解碼並切成獨立的 AudioBuffer，
  不等第一次使用者操作；每一組解碼完就立刻上線（p0 → p1 → p2，p1 之後等頁面載入完成才下載）。環境音在 p2 就緒後淡入。
  合成音庫只針對 manifest 沒有素材的 key，並行計算。第一次操作時只需建立並 resume AudioContext。
- 格式：`canPlayType('audio/ogg; codecs="vorbis"')` 為空（舊版 iOS Safari）就用 m4a；解碼失敗會換另一種格式。
  AAC 的 priming 靜音：build 時量測（json 的 `formats.m4a.lag` / `priming`），執行時再依解碼長度判斷瀏覽器有沒有自動去掉。
- 失敗退路：精靈圖失敗 → 逐檔載入（manifest）→ 程式合成。進度顯示在畫面上方的「音效載入中 xx%」，完成後消失，不擋住遊戲。

### 目錄結構
```
src/
  main.ts                 進入點
  core/                   Game（迴圈與場景切換）、Input、EventBus、Time
  player/                 PlayerController（膠囊碰撞）、MobileControls
  world/                  Surface 定義、地圖載入、maps/<era>.ts
  audio/                  AudioManager、SurfaceSounds、ReverbZones、合成替代聲音
  combat/                 Weapon、Damage、Health
  ai/                     Enemy、狀態機（巡邏/警戒/追擊/攻擊）
  items/                  物品定義、Inventory、LootTable
  economy/                Shop、價格
  save/                   SaveService 介面 + LocalSaveService（第二階段改成 ServerSaveService）
  ui/                     HUD、Hub 選單、背包介面
  data/                   items.ts、weapons.ts、eras.ts（純資料）
public/assets/            models/ sounds/ sprites/ textures/ + CREDITS.md + manifest.json
```

### 重要約定
- **地面材質標記**：每個可踩的 mesh 設定 `mesh.userData.surface`，值為
  `'concrete' | 'metal' | 'wood' | 'grass' | 'gravel' | 'dirt' | 'water' | 'tile' | 'carpet' | 'sand' | 'metal_hollow' | 'metal_grate'`（`metal` 鐵板、`metal_hollow` 貨櫃頂、`metal_grate` 格柵）。
  玩家向下射線讀取材質，決定腳步聲。槍彈擊中時也依材質播放不同的命中聲。
- **空間（回音區）**：地圖定義 `ReverbZone { box: Box3, type: 'outdoor' | 'indoor_small' | 'indoor_large' | 'tunnel' }`，
  AudioManager 依玩家所在區域切換 ConvolverNode 的混音比例（用程式產生脈衝響應，不需要素材）。
- **事件匯流排**：系統之間用 EventBus 溝通（例如 `footstep`、`shot`、`hit`、`itemPicked`、`stabilityChanged`），降低耦合。
- **資料與邏輯分離**：物品與武器數值放在 `src/data/`，邏輯層不寫死數值，方便第二階段搬到伺服器驗證。
- **存檔**：只透過 `SaveService` 存取，不可直接呼叫 localStorage。

## 5. 操作

| 動作 | 電腦 | 手機 |
|---|---|---|
| 移動 | WASD | 左側虛擬搖桿 |
| 視角 | 滑鼠（Pointer Lock） | 右半螢幕拖曳 |
| 射擊 / 瞄準 | 左鍵 / 右鍵 | 射擊鍵 / 瞄準鍵 |
| 跳 / 蹲 / 衝刺 | Space / C / Shift | 按鈕 / 按鈕 / 搖桿推到底 |
| 互動 / 換彈 / 背包 | E / R / Tab | 按鈕 |

## 6. 第一張地圖（暫定）
由素材取得情況決定，候選：「1990 年代港口工業區」（貨櫃＝金屬、碼頭＝木頭、倉庫＝水泥、空地＝碎石、海邊＝水）。
材質種類多，很適合展示依場地變化的音效。

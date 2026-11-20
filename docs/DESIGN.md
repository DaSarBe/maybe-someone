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
  combat/                 Weapon、Damage、Health、WeaponMods（配件數值）、WeaponAssembly（槍 + 配件組裝）、Viewmodel、TacticalFx
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
- **事件匯流排**：系統之間用 EventBus 溝通（例如 `noise`、`impact`、`itemPicked`、`stabilityChanged`）；所有「動作的聲音」統一走 `noise` 事件（見第 10 節），降低耦合。
- **資料與邏輯分離**：物品與武器數值放在 `src/data/`，邏輯層不寫死數值，方便第二階段搬到伺服器驗證。
- **存檔**：只透過 `SaveService` 存取，不可直接呼叫 localStorage。

## 5. 操作

| 動作 | 電腦 | 手機 |
|---|---|---|
| 移動 | WASD | 左側虛擬搖桿 |
| 視角 | 滑鼠（Pointer Lock） | 右半螢幕拖曳 |
| 射擊 / 瞄準 | 左鍵 / 右鍵 | 射擊鍵 / 瞄準鍵 |
| 跳 / 蹲 / 衝刺 | Space / C / Shift | 按鈕 / 按鈕 / 搖桿推到底 |
| 蹲跑（蹲下時衝刺） | C + Shift | 蹲下後把搖桿推到底 |
| 互動 / 換彈 / 背包 | E / R / Tab | 按鈕 |
| 手電筒 / 雷射開關（有裝才有用） | T | 「燈」按鈕（版面元素 `flashlight`，預設在左側搖桿上方） |

## 6. 第一張地圖（暫定）
由素材取得情況決定，候選：「1990 年代港口工業區」（貨櫃＝金屬、碼頭＝木頭、倉庫＝水泥、空地＝碎石、海邊＝水）。
材質種類多，很適合展示依場地變化的音效。

## 7. M4 戰鬥與敵人 AI 約定（Sonnet A）

- **RaidScene**（`world/RaidScene.ts`）是通用 Raid 場景，建構時接收 `RaidMapLoader`；時代 id → 載入器的對照表在 `world/maps/index.ts`（換正式地圖只改這裡）。
  容器、撤離點（`random` 的每場隨機開放）、抵達點、敵人、導航圖全部讀 `RaidMap`，場景不寫死座標。地圖載入是非同步的，期間顯示讀取畫面；`scene.loaded` 是完成的 Promise。
- **物品狀態值 `ItemStack.dur`**：護甲 = 剩餘耐久，武器 = 彈匣內子彈數（省略 = 全新 / 滿彈匣）。上限由 `itemMaxDur(id)` 決定。
  彈藥從背包扣（`EconomyService.consumeCarried`），換彈完成時才扣；彈匣與護甲耐久在換槍、開啟介面、撤離 / 死亡前寫回（`setEquipState`），不是每發都存檔。
- **戰鬥解耦**：`PlayerController` 不認識武器，只有 `speedScale`、`sprintBlocked`、`addView()`（後座力）、`shake()`（受傷）；`Input.lookScale` 用於瞄準與觸控輔助瞄準。
  武器系統透過 Input 與 EventBus 溝通：`noise`（開槍、換彈、腳步…，`source` = `'player'` 或敵人 id；M5s 取代了舊的 `shot` / `weaponAction` / `footstep` / `enemyVoice`）、`impact`（`flesh` = 打中人體）、`playerHurt`、`enemyHit`。
- **傷害**（`combat/Damage.ts`，玩家與敵人共用）：身體 ×1、四肢 ×0.7；護甲在耐久 > 0 時對身體與四肢減傷並消耗耐久（傷害 × 0.3）；距離衰減見 `damageFalloff`。**頭部不再算傷害倍率：爆頭一槍死，除非戴頭盔，見第 12 節。**
- **敵人 AI**（`ai/`）：`Brain.ts` 是純邏輯狀態機（巡邏 / 警戒 / 追擊 / 攻擊 / 搜索 / 死亡），`Perception.ts` 是視覺（發現值累積）的公式（聽覺已移到 `data/noise.ts`，見第 10 節），
  `Nav.ts` 是 A*，`NavBuilder.ts` 可在靜態碰撞上自動產生導航圖，`Enemy.ts` 負責移動、射擊、動畫，`EnemyManager.ts` 負責生成、事件分派、LOD（遠處降低 AI 與動畫更新頻率）。
- 敵人數值與掉落在 `data/enemies.ts`；武器手感（散佈、瞄準 FOV）在 `data/weaponHandling.ts`；醫療品在 `data/medical.ts`。

## 8. M4c 整合約定

- **地圖載入**：`maps/index.ts` 的 harbor_1990 用動態 import（獨立 chunk，不進主 bundle）；測試地圖用 `?scene=raid&map=test`（基礎 5 分鐘）。`RaidMap.ownsLighting` = true 時 RaidScene 不呼叫 `setupLighting`（光源、霧、天空在地圖 root 內）；`RaidMap.lightAt(pos)` 提供敵人感知用的亮度（harbor：室內外底值 + 點光源距離衰減）；`RaidMap.ambience` 設定地圖專屬環境音（浪聲定位、海鷗、遠方汽笛），由 `AudioManager.startMapAmbience` 執行。
- **時空穩定度時間** = 時代基礎時間（`eras.ts baseDuration`，harbor_1990 = 12 分鐘）+ 穩定器升級加成（每級 +45 秒）；測試地圖 5 分鐘。
- **負重**（`items/Inventory.ts`、`items/Profile.ts`）：
  - **計重**：背包 / 口袋格子內的物品照原重量；**穿在身上的裝備**（主武器含配件、副武器含配件、護甲、頭盔、背包本身）只算一半（`WORN_WEIGHT_FACTOR = 0.5`，`equipmentWeight`）。保險袋不計重（維持原狀）。物品詳細資訊中，穿戴中的裝備顯示「計重 x.x kg（穿戴 ×0.5）」，負重數字旁的 ⓘ 提示「穿戴裝備以一半重量計算」。
  - **上限** = 背包（或口袋）`maxWeight` + 升級「體能訓練」（`fitness`，5 級，每級 +3 kg，最多 +15；₵3,000 / 7,500 / 15,000 / 28,000 / 48,000）。
  - **四段門檻**（負重比例 = 計重 / 上限；`weightSpeedFactor`、`canSprintAtWeight`）：0～70% 正常；70～100% 線性變慢，100% 前最低 ×0.8；100～125% 速度 ×0.6、不能衝刺（蹲跑也不行，因為蹲跑也走衝刺判定）；超過 125%（`HARD_WEIGHT_CAP = 1.25`）撿不起東西 / 搬不進來，沿用原本的拒絕與提示。
  - **負重條**：滿格 = 125%，在 70% 與 100% 畫刻度；超過 70% 黃色、超過 100% 紅色。
- **槍械模型**：`combat/WeaponModels.ts` 載入 Quaternius OBJ+MTL，MTL 全是同一個灰色，所以依材質名稱重新上色並烤進頂點色，合併成最多 2 個 mesh（前段 + 槍托，瞄準時隱藏槍托），平面法線。槍口座標是火光與曳光彈的起點。載入失敗退回方塊槍。
- **音效**：`enemy` 類別在 p1 sprite；敵人的受傷 / 死亡 / 發現玩家喊叫走 `noise`（`hurt` / `death` / `alert`；alert 全場冷卻 4.5 秒、同一個敵人 15 秒）；`bulletFlyby`（敵人打偏且經過玩家 2m 內）、`playerHurt.armor`（護甲吸收 → `impacts.player_armor`）；`casing`（依地面材質變化）、`player_armor`、`bullet_flyby`、`shotgun_boom`、`shotgun_pump` 由 Synth 合成。衝鋒槍 = pistol_fire 加快 30% + 高頻擱架 +7dB；霰彈槍 = rifle_fire 降到 0.62 倍 + 合成低頻爆破層，開槍後 0.42 秒自動上膛（pump）。見 `AudioManager.SHOT_LAYERS`。

### 時代商人（漁市場「時代商行」）
核心特色：**把未來商品帶去過去賣**。貨幣是物品「舊台幣」`old_ntd`（類別 currency，1 張 = 1 元，可堆疊 5000、每張 0.0008 kg，帶回未來每張值 ₵1），只在背包裡流通，死亡就沒了。全部交易走 `EconomyService.traderSell / traderBuy`（驗證、失敗整筆回滾）；資料在 `data/traders.ts`，定價在 `economy/Trader.ts`。

| 項目 | 規則 |
|---|---|
| 收購未來商品 | `pricePast × 0.85`（電池 765、凝膠 1190、晶片 3060、纖維 1445），在未來買價約 224 / 336 / 910 / 420，約 3.4 倍 |
| 收購額度 | 每種物品每場前 3 件（稀有的 2 件）原價，之後每件只付 35%（市場飽和） |
| 收購其他物品 | 未來售價 × 0.2，前 6 件，之後 35% |
| 商品 | 每場依「時代 + Raid 開始時間」為種子，從商品表隨機挑（各有出現機率與庫存範圍）：古董約為未來售價的 75%、時晶碎片 NT$900（比未來賣價貴，少量）、當地彈藥、醫療品、雜貨 |
| 庫存 | 已買 / 已賣的數量記在 `raid.trade`，重新整理不會重置庫存；Raid 結束後清除 |
| 子彈 | 打商人只播放命中聲（`userData.flesh` 的隱形圓柱），商人不會死；敵人只以玩家為目標 |

一趟的獲利：帶 3 電池 + 3 凝膠 + 2 晶片（成本約 ₵4,800，重 3.4 kg），在商人處換得約 NT$12,000；再用其中一部分買古董（帶回未來約 +30%）。扣掉成本，一趟約 +₵8,000～11,000，但舊台幣放在背包，死亡全失。

## 9. M5 手機操作與按鍵配置約定

- **版面資料**（`src/ui/layout/model.ts`，純函式）：每個元素存「中心點相對安全區的比例 x、y（0～1）」＋倍率 `s`（0.5～2）＋透明度 `o`（0.2～1）；基準大小是安全區短邊（上限 430px）的比例。預設值定義在 `ELEMENT_DEFS`，沒被改過的元素不存檔、永遠走預設。存檔 key `layout`，格式 `{ version, active, slots[3]{name, items}, grid }`，讀檔一律經 `migrateStore`（損毀 / 舊版 / 未來版本都會變成合法資料）。
- **安全區**：`LayoutManager` 用探針元素量 `env(safe-area-inset-*)`（可用 CSS 變數 `--sa-t/-r/-b/-l` 覆寫，測試用），再加 6px 邊距。`index.html` 已有 `viewport-fit=cover`。
- **套用**：觸控版的 HUD 與按鈕都 `layout.bind(id, el)`，大小 / 位置 / 透明度由版面決定；電腦版不 bind（HUD 維持原樣，遊戲中不顯示觸控按鈕）。新增元素：在 `ELEMENT_DEFS` 加定義、跑 `tests/layout.test.ts`（6 種尺寸不重疊）。
- **編輯器**（暫停選單 →「按鍵配置」）：全部在草稿上編輯，「儲存」才寫入；重疊只警告不阻擋。
- **控制設定**（`src/settings/ControlSettings.ts`，存檔 key `controls`）：靈敏度、陀螺儀、蹲下 / 瞄準模式、左射擊鍵、輔助瞄準。`Input.setSettings` 即時套用；蹲下 / 瞄準的「點一下切換」統一在 `Input.setAction` 處理（所有來源通用）。
- **陀螺儀**（`src/input/Gyro.ts` + `gyroMath.ts`）：用 `devicemotion.rotationRate`，依 `screen.orientation.angle` 轉成螢幕軸，經死區與平滑後只呼叫 `Input.addLook(dx, dy, 'gyro')`。iOS 需在點擊中呼叫 `requestPermission()`，且只有 HTTPS 才能用。

## 10. M5s 聲音事件系統、敵人戰術與地圖難度

> 設計原則：**做任何事情都有該動作的聲音，而且依距離遠近變大聲或變小聲**，讓 NPC（以及第二階段的真人玩家）的行動可以被聽到，增加戰略性。

### 10.1 統一的 `noise` 事件
- `GameEvents.noise: NoiseEvent`（`src/data/noise.ts`）：`{ kind, position:{x,y,z}, source, surface?, loudness?, weaponId?, fallSpeed?, stage?, direction?, item? }`。
  玩家、敵人、（之後的）其他玩家做任何動作都發這個事件；**音效系統（播放）、敵人聽覺（`Enemy.hearNoise`）、聲音視覺提示（`NoiseIndicator`）都只訂閱它**。
  舊的 `footstep` / `land` / `shot` / `weaponAction` / `enemyVoice` 已併入。
- **第二階段準備**：payload 全部是可序列化的原始型別（座標是 `{x,y,z}`，不是 `Vector3`；`source` 是字串 id：`'player'` = 本機玩家、`'e3'` = 敵人、之後是其他玩家的 id），
  連線時伺服器可以直接廣播，每個客戶端用同一張表（`noiseRange`）+ 自己的 Octree 決定「我聽不聽得到、多大聲」。`isNpcSource(id)` 區分 NPC（`/^e\d+$/`）與真人；敵人只聽非 NPC 的聲音。
- **同一張距離表**：玩家聽 NPC 與 NPC 聽玩家都用 `NOISE_RANGE`（`data/noise.ts`），沒有第二份。

### 10.2 聽得到的距離
| 動作（kind） | 距離 |
|---|---|
| 衝刺腳步 `footstep_sprint` | 30m |
| 走路腳步 `footstep_walk` | 18m |
| **蹲走 `footstep_crouch`** | **0（完全無聲，不發事件）** |
| 蹲跑 `footstep_crouch_run` | 8m |
| 跳躍落地 `land` | 15～25m（依下落速度 2→11 m/s 線性） |
| 開槍 `shot` | 80～120m：手槍 80、衝鋒槍 90、霰彈槍 100、步槍 120（滅音器以後用 `loudness` 倍率） |
| 換彈 `reload`（3 段：卸彈匣 0%、插彈匣 42%、拉槍機 84%） | 10m |
| 切換武器 `weapon_swap` | 8m |
| 空槍 `dry_fire` | 6m |
| 霰彈槍上膛 `pump`（表外補充） | 10m |
| 治療 `heal`（撕繃帶 / 注射） | 8m |
| 搜刮 `search`（持續，每 0.5 秒一次心跳；開箱再一次）；安靜搜刮 `loudness` 0.5 | 12m（安靜 6m） |
| 撿起 / 丟下物品 `item_pickup` / `item_drop` | 6m |
| 裝備護甲 `armor_equip` | 6m |
| 和商人交易 `trade` | 8m |
| 撤離倒數 `evac`（時光機嗡嗡聲，持續） | 40m |
| 受傷悶哼、死亡 `hurt` / `death`（敵人發現玩家的喊叫 `alert`：表外補充，同為 20m） | 20m |

- **腳步乘地面材質係數** `SURFACE_LOUDNESS`（沿用原本 Perception 的數值並統一）：metal_hollow 1.8、metal_grate 1.6、metal 1.5、gravel 1.35、water 1.25、wood 1.2、tile 1.1、concrete 1.0、dirt 0.8、grass 0.6、sand 0.55、carpet 0.45。其他動作不乘。
- **衰減曲線** `distanceGain(dist, range)`：`REF_DISTANCE`（2.5m）內全開，之後 `(1 - t)^1.5`（t = (d-2.5)/(range-2.5)），**到 range 剛好 0、超過一律 0**（不像 inverse 衰減永遠有一點聲音）。
  AudioManager 的 GainNode、敵人聽覺機率、視覺提示三處共用這一條；PannerNode 的 `rolloffFactor = 0`，只負責 HRTF 方位。
- **牆壁遮擋**（`audio/Hearing.ts assessHearing`）：聲源（腳底的聲音抬高 0.9m）到耳朵做 Octree raycast（`AudioManager.setOccluder`，RaidScene 提供，與敵人視線同一支 `EnemyMover.los`）：被擋住 → 音量 ×0.4（-8dB）、低通 1000Hz。
  **每個聲音開始播放時只算一次**；持續型（搜刮、撤離嗡嗡聲）每 0.25 秒重新評估（`updateSustained`），超過 1 秒沒收到心跳就淡出停止。
- **上下樓層**：高低差超過 2.5m → 音量 ×0.88、低通 3200Hz、殘響多送 0.3。
- 播放規則：本機玩家（`source === 'player'`）的聲音非定位；其他人的聲音全部用 HRTF 定位 + 上述衰減；超過距離不播放（也不佔 voice）。`audio.debugInfo().noiseLog` 與 `audio.recent` 記錄每個聲音的距離、音量、是否遮擋、相對耳朵的方位角（-90 = 左、+90 = 右）。
- 新增的合成音（`audio/Synth.ts`，manifest 沒有素材所以不需要重建 sprite）：`weapons.mag_out / mag_in / bolt_rack`（換彈三段）、`weapons.swap`、`sfx.heal_bandage`、`sfx.heal_inject`、`sfx.armor_equip`、`sfx.trade_cash`、`impacts.body_fall`（倒地，另疊地面材質腳步聲）、`sfx.evac_hum`（可循環）。

### 10.3 蹲跑
`PlayerController`：蹲下時按衝刺（Shift，或手機把搖桿推到底）= **蹲跑**，速度 2.8 m/s（蹲走 1.9、走路 4.0），鏡頭晃動介於蹲走與走路之間，發出 `footstep_crouch_run`（8m）。
蹲走不發任何事件（AI 聽不到、自己也沒有腳步聲）。`StepIntensity = 'crouch' | 'crouch_run' | 'walk' | 'sprint'`。敵人也有蹲走（無聲）與蹲跑兩種姿態（`Enemy.stance`）。

### 10.4 聲音視覺提示（預設開啟）
`ui/NoiseIndicator.ts` + `ui/noiseIndicatorModel.ts`：準心周圍圓環上的小弧形，只顯示**別人**的聲音（`AudioManager.onHeard` 只通知非本機玩家、已通過距離與遮擋判定的聲音）。
角度 = 聲源相對視線的水平角（0 在上、順時針；正後方在下方，視角轉動時弧形跟著轉）；透明度、寬度、持續時間（0.6～1.2 秒）依「聽到的音量」；腳步白、槍聲紅（較寬較久）、其他動作黃；高低差超過 2.5m 加 ▲ ▼；同方向（16° 內）合併、最多同時 8 個。
開關在「操作設定 → 聲音」（`ControlSettings.soundIndicator`，預設開）。版面系統元素 `noisedir`（`fixed: true`）：位置固定在畫面中心（準心），使用者只能調大小與透明度，不參與重疊檢查。

### 10.5 敵人戰術（`ai/Tactics.ts` + `ai/Enemy.ts` + `ai/EnemyManager.ts`）
- **聽覺**：`Enemy.hearNoise(ev)`：先看在不在 `noiseRange` 內 → `assessHearing`（距離 × 遮擋 × 樓層）→ 機率 `hearChance = (0.45 + 0.55·√音量) × 聽力 × 難度聽覺倍率`（持續型 ×0.6）。聽到 → 警戒並前往聲源（誤差 = 距離 × 5%，槍聲 12%）。已進入戰鬥的敵人不會被引走。
  玩家在敵人附近搜刮、換彈、治療、開箱、交易、撤離都可能被聽到。
- **蹲下偷襲**：進入警戒 / 搜索時擲一次骰（`tactics.sneak × 難度`）；成功則距離調查點 / 最後已知位置 14m 內改成蹲走（無聲、速度 ×0.5）。
- **趁換彈衝過來**：聽到玩家換彈（每次換彈只擲一次）或看到玩家治療，且距離 ≤ 25m：依 `tactics.rush × 難度` 的機率，未交戰者直接進入追擊（`brain.rush`）、交戰中者 4 秒內往玩家推進（`pushT`）。
- **包抄**：同群組 2 人以上交戰時，`EnemyManager.assignFlanks`（每群組每 15 秒擲一次骰，`tactics.flank × 難度`）讓離玩家最遠（≥12m）的一個，用 `planFlank`（A*，隊友主路線上的節點 +60m、附近 5m 內 +18m 的額外成本）算出另一條路線繞到側面；
  共用節點超過一半或繞路超過主路線 2.5 倍 + 20m 就放棄。繞路時距離玩家 > 16m 且沒被看到用蹲跑（8m 腳步聲），被看到且 < 14m、超過 25 秒或走完路線就結束包抄。
- **腳步 noise**：巡邏走路 `footstep_walk`、追擊衝刺 `footstep_sprint`、偷襲蹲走無聲、包抄蹲跑 `footstep_crouch_run`；敵人的開槍、換彈（3 段）、受傷、死亡都發 `noise`。
- 敵人傾向（`EnemyDef.tactics`，再乘難度機率）：警衛 {偷襲 0.5、衝鋒 0.6、包抄 0.5}；**黑道打手**莽撞 {0.3、1.3、0.8}；**敵對穿越者**訓練有素 {1.4、1.0、1.4}。

### 10.6 地圖難度
`EraDef.difficulty: 1 | 2 | 3`（★ 簡單、★★ 普通、★★★ 困難）；`RaidMap.difficulty` 可覆寫（測試地圖 = 1，harbor_1990 = 2）。時光機面板顯示星等與說明。係數表 `DIFFICULTY`（`data/enemies.ts`）：

| | ★ | ★★ | ★★★ |
|---|---|---|---|
| 命中率倍率（上限 0.95） | 0.75 | 1.0 | 1.3 |
| 反應時間倍率（發現玩家所需時間） | 1.3 | 1.0 | 0.75 |
| 聽覺靈敏度倍率（只影響「聽到的機率」，距離仍由 noise 表決定） | 0.8 | 1.0 | 1.25 |
| 偷襲基礎機率 | 0.2 | 0.45 | 0.75 |
| 趁換彈 / 治療衝鋒基礎機率 | 0.25 | 0.5 | 0.8 |
| 包抄基礎機率 | 0.2 | 0.45 | 0.75 |

戰術機率 = 難度基礎機率 × 敵人傾向（上限 0.95）。

## 11. 搜刮手感（逐件揭露、直接裝備、安靜搜刮、自動拾取）

容器與屍體走同一套流程。資料與純函式：`data/search.ts`（揭露時間、開箱延遲、裝備護甲時間）、`items/LootSearch.ts`（揭露進度）、`items/GearCompare.ts`（新舊比較）、`items/LootActions.ts`（自動拾取）；EconomyService 新增 `equipFromContainer`、`autoPickup`、`isAutoPickup`。

### 11.1 流程
- **點一下互動就開始**（電腦 E、手機「互動」；按住也可以，只看按下那一刻）：第一次打開有 0.5 秒開箱動作（`CONTAINER_OPEN_SECONDS`，進度條「開啟中…」，結束時播 `container_open`）。期間**移動離開範圍或開槍**會中斷。打開過的容器之後直接開面板，不用再等。
- **逐件揭露**：打開後物品依序揭露，每件未揭露的格子顯示「？」與轉圈動畫（目前這件有進度圈）。每件時間 = 稀有度秒數 × 搜刮模組係數（`searchScale()`）× 安靜搜刮倍率：

| 稀有度 | common | uncommon | rare | epic | legendary |
|---|---|---|---|---|---|
| 秒數 | 0.6 | 0.9 | 1.4 | 2.0 | 2.8 |

  已揭露的可以馬上拿或裝備，其他的同時繼續揭露。每件揭露時播放 `sfx.loot_reveal`（Synth 合成，音高依稀有度）。
- **進度保留**：進度存在容器的 `LootSearch`（`done` + 目前這件的完成比例），關閉面板、離開範圍或被打斷（受傷會自動關閉面板並提示「搜刮被打斷」）都不會重來，下次回來從下一件繼續。揭露只在面板打開時推進（RaidScene.tickLoot）。
- **持續的 search noise**：揭露期間每 0.5 秒一次心跳（沿用持續型聲音機制），全部揭露完就停止。關閉面板就停止。
- **搜空**：全部揭露而且都被拿光 → 容器材質變暗、降低飽和度，浮標消失，提示改成「（已搜空）」，點互動只顯示提示。屍體沿用同樣判定（屍體本身沒有可變暗的網格，只有浮標消失與提示）。

### 11.2 直接裝備
- 搜刮清單中的武器、護甲、背包有「裝備」按鈕，並顯示與目前裝備的比較（綠 ▲ 變好、紅 ▼ 變差）：護甲 = 等級、耐久、減傷；武器 = 傷害、射速、彈匣、內有子彈（彈藥種類不同時另列）；背包 = 格數、負重。欄位是空的就只列新裝備的數值。
- 欄位由物品決定（沿用 `equip`）：手槍 = 副武器、其他槍 = 主武器、護甲、背包各一格。因此「兩把槍都有時取代哪一把」不會發生：新槍一定取代同欄位那一把。
- **換下的裝備**：預設放回容器**同一格**；可切換「放進背包」，背包放不下時該選項停用並顯示原因（`equipFromContainer(..., { dryRun: true })` 預先驗證）。
- **換背包**：舊背包內容搬進新背包，**格數或負重（含 1.25 倍硬上限）放不下就整個拒絕**並提示（不會弄丟東西；選這個而不是「留在容器」）。
- 彈匣子彈數、護甲耐久（`dur`）跟著物品走。失敗時存檔與容器完全不動；成功才把容器內容寫回。
- **護甲**要 1.5 秒（`ARMOR_EQUIP_SECONDS`，按鈕上有進度，可按「取消裝備」、換選別的物品或關閉面板中斷），完成時發 `armor_equip` noise（6m）。**武器**立即完成，發 `weapon_swap` noise（8m）。背包無聲。

### 11.3 安靜搜刮
搜刮面板上的切換鈕（也在「操作設定 → 搜刮」），存在 `ControlSettings.quietSearch`（預設關，記住上次選擇）：揭露時間 ×1.6（`QUIET_TIME_MULT`）；搜刮 noise 帶 `loudness: 0.5`（`QUIET_SEARCH_LOUDNESS`），12m → 6m。聽得到的距離仍只由 `noiseRange` 計算。切換時目前這件的進度用比例保留。

### 11.4 自動拾取（預設開）
揭露出的物品符合以下條件時，自動放進背包並提示「自動拾取：步槍子彈 ×30」、播放拾取聲、發 `item_pickup` noise（6m）：**目前裝備的主 / 副武器使用的彈藥**；**時晶（所有等級）**。背包放不下（全部或一部分）就留在容器並提示「背包已滿」。
操作設定 →「搜刮」有兩個獨立開關：`autoPickupAmmo`、`autoPickupChronite`。全部經過 `EconomyService.autoPickup`。

### 11.5 手機版面（874×402）
搜刮面板仍是三欄；容器格 50px，右欄裝備時隱藏說明文字與重量列，改顯示比較；「換下的裝備」切換與「裝備 / 拿取」按鈕固定在右欄底部（不遮住物品，上方資訊區可捲動）。揭露時只替換被揭露的格子，不重繪整個面板（避免打斷手機上的點擊）。


## 12. M6h 爆頭與頭盔（戰鬥章節更新）

### 12.1 規則
- **爆頭一槍死**：任何武器打中沒戴頭盔（或頭盔耐久歸零）的頭，都是立即死亡，不看距離與武器傷害；玩家與敵人一樣。玩家打敵人用射線部位判定（`combat/HitZones.ts`，頭 = 球），不用機率。
- **新增頭盔裝備欄 `helmet`**（`EquipSlot`），物品類別 `helmet`，`helmet_1` ～ `helmet_4`，耐久存在 `ItemStack.dur`（與護甲一樣，flush 時寫回）。判定與數值全部在 `data/helmet.ts`（純函式、不依賴 three.js）。
- 武器類別 `WeaponStats.weaponClass`：手槍、衝鋒槍 = `light`；步槍、霰彈槍 = `heavy`。
- **霰彈槍每顆彈丸各自判定**，前面的彈丸讓頭盔耐久下降，後面的依剩餘耐久判定。
- **低耐久降級**：耐久低於 30%（`LOW_DUR_RATIO`）保護降一級（1 級降成沒戴）；耐久 0 = 沒戴。
- 頭盔被打中：`helmet_ping` noise（15m，聲源在頭部；Synth 合成 `impacts.helmet_ping`）、`helmetHit` 事件；玩家頭盔被打中時 HUD 閃白光並短暫耳鳴（`sfx.tinnitus`）。同一次齊射的多顆彈丸只響一次。
- 3、4 級頭盔戴上後視野邊緣有輕微暗角（`HELMET_VIGNETTE`，只看生效等級；降級後減輕）。

### 12.2 頭盔表（weaponClass × helmetLevel；傷害為目標最大 HP 的比例；`HELMET_TABLE`）
| 頭盔 | 耐久 | 輕型（手槍、衝鋒槍） | 重型（步槍、霰彈槍每顆彈丸） | 重量 |
|---|---|---|---|---|
| 無 / 已損毀 | - | 一槍死 | 一槍死 | - |
| 1 級 工地安全帽 | 30 | 擋下，受 70～85%（耐久 -20%） | 一槍死（頭盔 -60%） | 0.6 kg |
| 2 級 纖維戰術頭盔 | 45 | 擋下，受 25～35%（-12%） | 一槍死（-50%） | 0.9 kg |
| 3 級 複合陶瓷頭盔 | 60 | 擋下，受 10～20%（-8%） | 擋下，受 70～85%（剩一點血），耐久 -40% | 1.2 kg |
| 4 級 重型複合頭盔 | 80 | 擋下，受 5～10%（-5%） | 擋下，受 40～55%（-22%） | 1.6 kg |

實測（滿血、滿耐久、取樣平均）：玩家戴 1 級被手槍爆頭 2 發死、2 級 4 發、3 級約 7 發、4 級約 14 發；步槍 / 霰彈：1、2 級 1 發、3 級 2 發、4 級約 3 發。

### 12.3 敵人打中玩家時的爆頭機率（`HEADSHOT_BASE` × 距離係數 × 種類係數 `EnemyDef.headCoef`）
- 難度基礎：★ 2%、★★ 4%、★★★ 7%。
- 距離：5m 內 ×1.5、超過 25m ×0.4、其間 ×1。
- 種類：港口警衛 0.8、黑道打手 0.8、敵對企業穿越者 1.3。
- 每一次開槍只擲一次爆頭骰（霰彈槍最多一顆彈丸打中頭）；擲到爆頭時，由玩家的頭盔決定生死。

| 敵人 | ★ 近 / 中 / 遠 | ★★ 近 / 中 / 遠 | ★★★ 近 / 中 / 遠 |
|---|---|---|---|
| 警衛、打手（0.8） | 2.4 / 1.6 / 0.6% | 4.8 / 3.2 / 1.3% | 8.4 / 5.6 / 2.2% |
| 穿越者（1.3） | 3.9 / 2.6 / 1.0% | 7.8 / 5.2 / 2.1% | 13.7 / 9.1 / 3.6% |
（近 = 5m 內、中 = 5～25m、遠 = 25m 外；機率是「每一發打中玩家」的爆頭比例）

### 12.4 敵人的頭盔（`EnemyDef.helmet`）
- 警衛：沒有。打手：40% 機率戴 1 級（耐久 70～100%）。敵對穿越者：一律 3 級（耐久 60～100%，隨機）。
- 頭盔顯示在敵人模型上（`ai/EnemyModel.ts createHelmetMesh`：半球殼，依等級改變顏色與形狀；1 級黃色安全帽帶帽簷、2 級橄欖綠、3 級藍灰陶瓷帶中脊、4 級深紫全罩帶青色面罩）；掛在 `Head` 骨骼上（`HEAD_ANCHOR` 依模型調整位置與大小），找不到骨骼就依身高放在頭部高度。耐久歸零時隱藏。
- 死後屍體可搜刮頭盔（帶剩餘耐久；打手 80%、穿越者 100% 會掉，耐久歸零不掉），可直接 `equipFromContainer` 裝備；頭盔是即時裝備（不像護甲要 1.5 秒），裝備時發 `armor_equip` noise。
- 掉落表：櫃子 / 工具箱 / 保險櫃 / 屍體（低機率）；時代商行偶爾進貨 1、2 級。

### 12.5 價格（黑市終端機：基準價 × 稀有度 × 每日浮動 × 買價 1.4）
1 級 ₵570（common）≈ ₵800、2 級 ₵1,620（uncommon）≈ ₵2,500、3 級 ₵4,000（rare）≈ ₵7,000、4 級 ₵7,620（epic）≈ ₵16,000；每日 ±10%。初始 ₵8,000 買得起 1 級，2 級要先賺一趟。時代商行：1 級 430 舊台幣（35%）、2 級 1,300（20%）。

### 12.6 HUD、存檔與結算
- 桌面：護甲下方多一條頭盔耐久（「頭盔 III 41/60」，降級時變橘色）。手機：版面系統新增元素 `helmet`（`ui/layout/model.ts`，預設在護甲下方），版面單元測試覆蓋 6 種機型不重疊。
- 存檔 `PROFILE_VERSION` 1 → 2：舊存檔沒有 `equipment.helmet`，migrate 補上 `null`。
- 死亡結算：「被 XX 擊殺（爆頭）」（`ResultPanel` 的 `headshot`，由 `PlayerHealth.hit` 的 zone 決定）。
- 測試掛鉤（`?debug=1`）：`scene.debugHeadshot(weaponId)`、`scene.debugSpawnEnemy(kind, dist, helmet?)`。

### 12.7 TTK（發數；爆頭 = 打中頭）
| 目標（HP） | 爆頭：無頭盔 | 爆頭：有頭盔，輕型 | 爆頭：有頭盔，重型 | 身體：手槍 / 衝鋒槍 / 步槍 / 霰彈（全中） |
|---|---|---|---|---|
| 警衛（50，無甲） | 1 | - | - | 3 / 3 / 2 / 1 |
| 打手（85，甲 1） | 1 | 1 級：2 | 1 級：1 | 5 / 5 / 3 / 2 |
| 穿越者（110，甲 3） | 1 | 3 級：約 7（5～9） | 3 級：2 | 9 / 10 / 6 / 3 |
（身體 TTK 沒有改變；爆頭不再看武器傷害，所以 2.5 倍頭部倍率已移除。）


## 13. M6g 槍械配件、改槍台與瞄具瞄準

### 13.1 配件槽與配件（`src/data/attachments.ts`；所有數值都在這個資料表）
五個槽位：**瞄具**（`sight`，不裝 = 機械瞄具）、**槍口**（`muzzle`）、**握把**（`grip`）、**彈匣**（`mag`）、**戰術**（`tactical`）。
每個配件是一種物品（類別 `attachment`，`maxStack` 1，有重量、價格、稀有度），效果寫在 `ATTACHMENTS[id].effect`（乘數，1 = 不變）。

| 配件（id） | 槽位 | 效果 | 缺點 | 重量 | 基準價 / 黑市買價 | 稀有度 |
|---|---|---|---|---|---|---|
| RD-1 紅點（`att_reddot`） | 瞄具 | 瞄準散佈 ×0.85 | 瞄準時間 ×1.06 | 0.15 | 900 / ₵1,386 | 優良 |
| HX-3 全息（`att_holo`） | 瞄具 | 瞄準散佈 ×0.8、瞄準視野 +6° | 瞄準時間 ×1.1 | 0.25 | 1,500 / ₵2,625 | 稀有 |
| SC-2 二倍鏡（`att_scope2x`） | 瞄具 | 2 倍（瞄準 FOV 30°）、瞄準散佈 ×0.9 | 瞄準時間 ×1.28、瞄準移速 ×0.85 | 0.4 | 2,200 / ₵3,850 | 稀有 |
| SC-4 四倍鏡（`att_scope4x`） | 瞄具 | 4 倍（瞄準 FOV 15°，刻度十字線）、瞄準散佈 ×0.8 | 瞄準時間 ×1.5、瞄準移速 ×0.7、腰射散佈 ×1.1 | 0.6 | 3,400 / ₵7,140 | 史詩 |
| SP-9 滅音器（`att_suppressor`） | 槍口 | 槍聲範圍 ×0.25、火光 ×0.35、敵人難以定位 | 傷害 ×0.95、射程 ×0.9 | 0.4 | 2,800 / ₵4,900 | 稀有 |
| MB-2 制退器（`att_brake`） | 槍口 | 後座力 ×0.8 | 槍聲範圍 ×1.1、火光 ×1.2 | 0.2 | 700 / ₵1,078 | 優良 |
| VG-1 垂直握把（`att_grip`） | 握把 | 後座力 ×0.9、腰射散佈 ×0.9 | - | 0.25 | 600 / ₵840 | 普通 |
| XM-5 擴容彈匣（`att_extmag`） | 彈匣 | 彈匣容量 ×1.5（進位） | 換彈時間 ×1.12、重量增加 | 0.3 | 1,000 / ₵1,540 | 優良 |
| LZ-1 雷射（`att_laser`） | 戰術 | 開啟時腰射散佈 ×0.75（`LASER_HIP_SPREAD`）；紅色光束與光點 | 敵人看得到光束（見 13.5） | 0.1 | 900 / ₵1,386 | 優良 |
| FL-2 手電筒（`att_flashlight`） | 戰術 | 聚光燈照亮前方 | 敵人更容易發現你（見 13.5） | 0.2 | 500 / ₵700 | 普通 |

（賣出價 = 基準價 × 稀有度係數 × 每日浮動；買價 = 賣出價 × 1.4，與其他物品相同。）

### 13.2 相容表（`MOD_COMPAT`；不在表內的槽位 / 配件一律拒絕）
| 武器 | 瞄具 | 槍口 | 握把 | 彈匣 | 戰術 |
|---|---|---|---|---|---|
| P-9 手槍 | 紅點、全息 | 滅音器 | - | 擴容彈匣 | 雷射、手電筒 |
| KR-45 衝鋒槍 | 紅點、全息、2 倍 | 滅音器、制退器 | 垂直握把 | 擴容彈匣 | 雷射、手電筒 |
| AR-7 步槍 | 紅點、全息、2 倍、4 倍 | 滅音器、制退器 | 垂直握把 | 擴容彈匣 | 雷射、手電筒 |
| S-12 霰彈槍 | 紅點、全息、2 倍 | 制退器 | 垂直握把 | - | 雷射、手電筒 |

### 13.3 資料與經濟
- `ItemStack.mods?: Partial<Record<ModSlot, string>>`：配件跟著武器走。`Inventory.cloneStack / makeStack`、`add / addStack / forceAdd / takeAt / moveWithin` 都會保留 `mods`；買賣（估價 = 武器 + 各配件的賣出價）、倉庫 / 保險箱 / 背包 / 保險袋、`equip / unequip / equipFromContainer`、死亡掉落（`RaidResult.items` 帶 `mods`）、保險袋保住、撤離帶回、屍體（`buildCorpseLoot` 的 `mods`）、商人收購（武器與配件一起算）、`lootItem` 都帶著。重量 `stackWeight` 含配件。
- 存檔 `PROFILE_VERSION` 2 → 3（`mods` 欄位；舊存檔的武器沒有配件）。`cleanStack` 用 `cleanMods` 清掉裝不上的配件，彈匣 `dur` 上限用「含擴容彈匣的容量」（`itemMaxDur(id, mods)`）。
- `EconomyService`（UI 只能呼叫這裡）：
  - `installMod(weapon, from)`：從容器格取 1 個配件裝上去；同槽位原本的配件放回倉庫（滿了放背包）。
  - `removeMod(weapon, slot, dest?)`：卸下，放進倉庫（預設）或背包。卸下擴容彈匣時彈匣超過新容量的子彈會換回彈藥放進倉庫（不會弄丟）。
  - `buyAndInstallMod(weapon, attId)`：直接向黑市購買並安裝。
  - `weapon` 是 `{ equip: 'primary' | 'secondary' }` 或 `{ loc: { c, i } }`。**只能在基地**（Raid 中回傳 `in_raid`）；不相容回傳 `incompatible`；失敗時存檔完全不動。
- 效果計算：`combat/WeaponMods.ts` 的 `effectiveWeapon(weaponId, mods)`（純函式）回傳套用後的 `stats`（傷害 / 射程 / 後座力 / 換彈 / 彈匣）、`handling`（散佈 / 瞄準時間 / 瞄準移速 / 瞄準 FOV）、`loudness`、`flash`、`sight`、`tactical`、`weight`；`statRows` 給改槍台的數值面板；`lookScaleForFov` 是倍鏡的靈敏度係數。

### 13.4 改槍台（基地）
- 基地南牆前的「**改槍台**」互動站（`world/maps/hub.ts` 的 `bench`，E / 「互動」開啟 `ui/panels/BenchPanel.ts`）。
- 左：身上裝備與倉庫 / 背包 / 保險箱裡的武器；中：可以拖曳旋轉的 3D 預覽（`ui/WeaponPreview.ts`，面板內獨立的 WebGLRenderer，關閉面板就釋放；沒操作時在側面輕輕擺動），下方是五個槽位按鈕；右：數值（後座力、腰射散佈、瞄準散佈、瞄準時間、彈匣容量、換彈時間、槍聲範圍、重量；綠色 ▲▼ = 變好、紅色 = 變差，和未改裝的原槍比）與該槽位的配件清單。
- 清單每一列：持有的（倉庫 / 背包）標示「倉庫 ×n」，點一下裝上；沒有的標示黑市價格，點一下「購買並安裝」；已裝的點一下卸下。裝上 / 卸下後預覽與數值即時更新。
- 手機橫向 874×402：三欄（武器 / 預覽 + 槽位 / 數值 + 配件清單），配件清單可以捲動；窄螢幕隱藏配件說明的優缺點小字。
- 背包 / 倉庫的物品格：武器右上角顯示 ⚙ 配件數；物品詳細資訊列出各槽位配件與含配件的重量 / 估價；屍體與箱子裡的武器同樣顯示（撿到的武器帶著原本的配件，Raid 中不能拆裝）。

### 13.5 配件在戰鬥中的作用
- **槍聲**：玩家開槍的 `noise` 事件帶 `loudness`（滅音器 0.25、制退器 1.1，乘在 `data/noise.ts` 的槍聲距離上：步槍 120m → 30m / 132m）與 `suppressed`。敵人開槍走同一套規則（`Enemy.shoot` 帶自己槍上的 `loudness`）。滅音器的槍聲在 `AudioManager.playShot` 用 `SUPPRESSED_SHOT` 處理現有槍聲：低通 1.4kHz、音量 ×0.5、降音 8%、殘響減少。敵人聽到滅音槍聲時方位誤差變成 `SUPPRESSED_ERR_K`（3）倍且至少 5m（只會調查大概方向）。
- **手電筒**（T / 「燈」鈕，`WeaponSystem.toggleTactical`）：相機上預先加入的 SpotLight（`TacticalFx`），開啟才有強度。敵人視覺（`ai/Perception.ts` 的 `tacticalVision`，`TACTICAL_VISION`）：玩家所在位置的有效亮度往 1 拉近（×0.9 的暗度）、視距 ×（1 + 0.35 ×（1 − 亮度））、發現值增速 ×（1 + 0.6 ×（1 − 亮度））；亮度越低（隧道、倉庫）效果越大，白天幾乎沒差。
- **雷射**：預設開啟（同一個 T 鍵開關）。槍上模組射出紅色光束到準心所指處，命中點有紅色光點（`TacticalFx`，瞄準時光束淡出、光點保留）；腰射散佈 ×0.75。敵人的發現值 ×1.3、視距 ×1.1，任何亮度都看得到。
- **擴容彈匣**：`WeaponSystem.refreshFromEquipment` 用 `effectiveWeapon(...).stats` 建立 `WeaponState`（彈匣容量與換彈時間都是套用後的值），換彈時從背包扣實際裝入的發數；改槍後彈匣超量由 `EconomyService` 處理（見 13.3）。
- **倍鏡**：瞄準 FOV 取配件的 `scopeFov`（2 倍 30°、4 倍 15°），視角靈敏度 = `lookScaleForFov(fov)`（視野比例，再乘 `Input.addLook` 的「瞄準靈敏度」設定；陀螺儀同樣縮放）。瞄準到底時 4 倍鏡有呼吸晃動（差分加在視角上，不會漂移；蹲下減半）。

### 13.6 瞄具瞄準（準心消失、改用槍上的瞄具）
- **準心淡出**：`CombatHud.setAds(ads, scopeZoom)`：準心透明度 = 1 − 2.2 × 瞄準程度（約瞄準一半就消失），放開瞄準淡入；命中標記不受影響。
- **瞄準線**（`combat/WeaponAssembly.ts`）：每把槍的模型設定（`WeaponModels.ts` 的 `mounts`）有照門 `rear` 與準星 `front`，以及配件安裝點（導軌 `rail`、握把 `grip`、戰術 `tac`、彈匣 `mag`）。`adsPoseOf` 由瞄準線自動算出瞄準姿勢：整支槍俯仰到讓瞄準線水平、再平移到 rear 落在相機前方 `eyeRelief`（機械 0.2、紅點 / 全息 0.13、倍鏡 0.07）且整條線落在相機視線上 —— **射擊從相機沿視線發出，所以瞄具指的地方就是彈著點**。`Viewmodel.update` 在腰射姿勢與瞄準姿勢之間以瞄準程度插值。
- **機械瞄具**：沒裝瞄具時在槍上加準星（柱 + 白色準星點）與照門（兩側立柱、中間缺口），瞄準線高出槍身 `IRON_LIFT`（1.8cm）穿過缺口與準星頂端。衝鋒槍（P90 造型）因為機匣上方的光學部件擋住，準星與照門架在它的上方。
- **紅點 / 全息**：瞄具模型的視窗中心就是瞄準線的照門位置；光點是 Canvas 繪製的圖（紅點 = 實心圓 + 光暈；全息 = 圓圈 + 中心點 + 刻度，加法混合、不做深度測試），**畫在相機視線上**（螢幕中心、角大小固定：紅點 1.6°、全息 4.6°），所以槍晃動時光點仍對準射擊點；視窗離開視線時光點淡出。
- **倍鏡**：瞄準時主相機 FOV 縮小；瞄準程度超過 0.93 時 `Viewmodel` 隱藏槍（`scoped`），畫面由 `CombatHud` 的倍鏡畫面取代（比畫中畫省效能，手機友善）：黑色圓形鏡框（超大的 box-shadow 塗黑圓外）、SVG 十字線（2 倍：粗外框 + 細十字；4 倍：加水平 / 垂直刻度與下方測距線）、倍率標示。鏡框直徑隨瞄準程度從 0.16 倍放大到 0.96 倍螢幕高度（鏡框從槍上放大到全螢幕），黑色外圈與十字線依序淡入。倍鏡畫面在觸控按鈕與 HUD 之下（z-index 9），按鈕仍看得到、點得到。
- **瞄準時的晃動**：`Viewmodel` 的慣性擺動、走路晃動、呼吸晃動在瞄準時乘 `1 − 0.92 × 瞄準程度`，後座力動畫減半。
- 組裝與預覽共用 `buildAssembly`；配件模型載入失敗（`AttachmentModels.getAttachmentModel` 回傳 null）時改用方塊幾何。制退器與擴容彈匣沒有素材，用程式產生的簡單幾何；紅點 / 全息圓圈 / 倍鏡十字線用 Canvas 或 SVG 繪製。

### 13.7 配件的取得
- **黑市終端機**：新分類「配件」（`SHOP_CATEGORIES`），買價見 13.1。**時代商行**（`TRADERS.harbor_1990.stock`）：滅音器 ₱4,200（機率 25%）、紅點 ₱1,300（機率 30%），各 1 件，價格比基地高。
- **掉落表**（`LOOT_TABLES`，配件佔箱子的低到中機率，已乘稀有度係數）：木箱：握把、手電筒、雷射；工具箱：握把、手電筒、擴容彈匣、制退器、紅點；辦公櫃：紅點、全息、擴容彈匣、雷射、手電筒、制退器；保險櫃：滅音器、2 倍、4 倍、全息、紅點、擴容彈匣；屍體通用表：握把、手電筒、雷射、擴容彈匣、紅點。
- **敵人的武器配件**（`EnemyDef.loadout`，`rollEnemyMods`）：警衛沒有；打手：握把 22%、擴容彈匣 20%（霰彈槍裝不上）、紅點 8%；敵對穿越者（步槍）：紅點 40% / 2 倍 28% / 全息 12%（約 8 成有瞄具）、滅音器 28% / 制退器 12%、握把 20%。死亡後屍體上的武器帶著配件，可以直接裝備。

### 13.8 測試
- 單元（`tests/attachments.test.ts`）：相容表、`installMod / removeMod / buyAndInstallMod`（含拒絕與 Raid 限制）、效果與槍聲範圍、擴容彈匣換彈、mods 跟著武器走（裝備、移動、估價、重量、死亡 / 撤離、屍體、直接裝備、商人、存檔 migrate）、敵人配載機率、手電筒 / 雷射的視覺判定、瞄準姿勢（4 把槍 × 5 種瞄具，瞄準線都在相機視線上）；版面測試新增 `flashlight` 按鈕（6 種機型不重疊）。
- Playwright（`?debug=1`）：改槍台安裝紅點 / 滅音器 / 握把並重新整理、瞄準時準心消失與各瞄具畫面、彈著點距畫面中心 < 2% 螢幕寬、50m 外聽不到滅音槍聲、隧道裡手電筒發現值較高、擴容彈匣換彈、屍體步槍帶配件、手機 874×402 的改槍介面與倍鏡畫面。

## 14. M6f 陣營、聲望與 NPC 之間的戰鬥

### 14.1 陣營與關係（`src/data/factions.ts`，純資料與純函式）
| id | 名稱 | 說明 |
|---|---|---|
| `guard` | 港務警衛 | 官方，維持秩序 |
| `triad` | 海龍幫 | 走私集團 |
| `corp_aurora` / `corp_chronos` / `corp_crimson` | 晨星重工 / 時穹科技 / 赤焰軍工 | 未來企業 |

- 敵人種類 → 陣營：`guard` → 警衛、`thug` → 海龍幫、`rival_agent` → 生成時挑企業（`pickAgentFaction`：15% 是**玩家自己的企業**（友軍），其餘從另外兩家挑一家；尚未選企業就三選一）。可以在 `EnemySpawn.faction` 直接指定。
- 關係表（`relationBetween(a, b, corpTruce)`）：同陣營友好；guard ⇄ triad、guard ⇄ 所有企業、triad ⇄ 所有企業 **一定敵對**（`HOSTILE_PAIRS`）；企業 ⇄ 企業 **每場 Raid 隨機**休戰（`CORP_TRUCE_CHANCE` = 40%）或敵對。休戰旗標在 `startRaid` 以出發時間為 seed 擲出（`rollCorpTruce`，存在 `RaidState.truce`，重新整理不會變），Raid 開始時畫面中央第二行提示「企業之間：本場休戰 / 敵對」。

### 14.2 玩家聲望（`Profile.reputation`，永久累積）
- 每個陣營 -100～+100；初始 guard -40、triad -40、自己的企業 +100（固定）、其他兩家 -30（尚未選企業時三家都 -30）。
- 態度（`attitudeOf`）：< -20 **敵對**（看到就開火）；-20～+40 **中立**（不主動攻擊，會停下來盯著你；被挑釁就翻臉）；> +40 **友好**（不攻擊、不會被腳步引來、可能幫忙）。自己企業的穿越者一定友好。
- 聲望變化（`killRepChanges`、`BRIBE`）：

| 事件 | 變化 |
|---|---|
| 殺死某陣營的成員 | 該陣營 -15（對方是友好態度時 -25）；與該陣營**靜態敵對**的陣營各 +3（殺黑道 → 警衛與三家企業 +3；企業之間的休戰不算） |
| 時代商行「找人打點」 | guard 或 triad +5（1,000 舊台幣，從背包扣）；同一陣營每場最多 +15（`bribesLeft`） |
| 誤殺友軍（自己企業的穿越者） | 聲望不變；結算時扣 ₵3,000「誤傷賠償」（不會扣到負數） |
| 撤離帶出時晶 | 不影響聲望 |

- 只有**玩家**殺人才算（`Enemy.killer === 'player'`）；NPC 互相殺不改聲望。聲望變化立即寫進存檔，並累計在 `RaidState.repDelta`，結算畫面（`ResultPanel`）列出每個陣營的 ▲▼ 與賠償。

### 14.3 企業（`CORPS`）
- 新存檔與舊存檔（migrate v3 → v4：`corp = null`、聲望用初始值）第一次進基地會跳出「加入企業」畫面（`CorpPanel`，鎖定，不能關）。
- 加成：**晨星重工** 護甲與頭盔 9 折；**時穹科技** 時空穩定度 +60 秒；**赤焰軍工** 武器與配件 9 折（`EconomyService.buyPriceOf` / `buy` / `buyAndInstallMod` 與 `Profile.raidDuration` 都套用）。
- 選擇後不能免費更換；在「陣營情報」頁面花 ₵50,000（`SWITCH_CORP_COST`，二次確認）轉換企業，三家企業的聲望重置（guard / triad 保留）。

### 14.4 AI：目標不只是玩家（`ai/Enemy.ts`）
- `Enemy.faction`、`provoked`（本場被挑釁）。AI 的目標是 `Tgt = { pt: PlayerTarget, enemy: Enemy | null }`：玩家，或另一個敵人（他的位置與姿態由 `view` 提供，和玩家用同一套 `PlayerTarget`，所以視覺 / 命中率 / 掩護 / 包抄的程式都不用分兩套）。
- **選目標**（`selectTarget`）：每 0.3～0.5 秒掃描一次（不是每個 tick）。玩家只有在對他敵對（聲望 < -20 或被挑釁；自己企業除外）時才是候選；其他 NPC 要「陣營敵對（含本場休戰判斷）、在視距 1.1 倍內」，先用距離篩，再對最近的 3 個做視野 + 視線檢查（`mover.los`）；取最近的。已經在交戰中且目標活著就不換；暫時轉頭或被擋住（還在 1.3 倍視距內）不會忘記目標。群組通知（`alertGroup`）只會拉動「對這個目標也敵對」的隊友。
- **NPC 開槍**：`Enemy.shoot(dist, tg)` 同一套命中率 / 爆頭 / 散彈；打中 NPC 呼叫 `victim.takeHit(base, zone, from, weaponClass, attacker)`（同一套頭盔 / 護甲傷害），被打的人立刻把攻擊者當目標；打偏的彈著點與玩家一樣（只有打向玩家時才有 `bulletFlyby`）。死掉的 NPC 一樣變成可搜刮的屍體（`killer` 記錄是誰殺的）。
- **聽覺**：NPC 之間**只聽槍聲**（`noise.kind === 'shot'`，來源是 NPC id）：其他陣營開的槍會引來調查（同陣營由群組通知處理）；腳步、換彈等其他 NPC 聲音一律不聽。對中立 / 友好的 NPC，玩家的腳步、換彈、搜刮聲不會引來他們（槍聲仍會 → 他們趕來，看到敵對陣營就打起來）。玩家一樣聽得到 NPC 的槍聲，可以坐收漁翁之利。
- **效能**：目標掃描節流（0.3～0.5 秒）、LOS 只對最近 3 個候選、交戰中的 NPC 不論多遠至少 1/15 秒一個 tick。12 個敵人時 AI 平均耗時約為原本的 1.0～1.3 倍（見 14.8）。
- **中立盯著看**：中立的 NPC 在巡邏狀態、玩家 20m 內且在視野內（每 0.3 秒檢查）時停下腳步、轉向玩家（`watching`）。

### 14.5 挑釁（`ai/Provoke.ts`，純函式）
讓中立 / 友好的 NPC 在**本場** Raid 變成敵對（自己企業的穿越者不會被挑釁）：
- **打中他**（`takeHit`）：他和同群組（`EnemySpawn.group`）的隊友一起被激怒；
- **2m 內開槍**（`shotProvokes`，`EnemyManager` 訂閱玩家的槍聲 noise）；
- **瞄準他**：準心落在他身上、15m 內（腰射或瞄準都算）累積計時，**1 秒**先警告（頭上橘色「！」+ alert 聲），**2 秒**翻臉（紅色「！」）；準心移開後計時以 2 倍速倒退（`stepAim`、`EnemyManager.updateAim`、`RaidScene.updateAimTarget`）。

### 14.6 地圖與衝突事件
- `harbor1990/data.ts`：新增警衛巡邏 `whpatrol`（倉庫南側外牆，正對倉庫南門）與 `yardpatrol`（貨櫃堆場北緣），與黑道 `wh` / `yard` 的巡邏路線有交集；企業穿越者 `rivalD`（貨櫃頂）、`rivalE`（辦公大樓走廊，和警衛的巡邏線相交）。生成數量超過上限 12 時隨機取捨（`EnemyManager.spawn`），所以每場的陣營組合都不一樣。
- **衝突事件**（`RaidScene.triggerConflict`）：Raid 開始 2～5 分鐘後觸發一次：挑一組「對另一組敵對」的巡邏隊（優先警衛），派他們（`Enemy.dispatch`，覆蓋巡邏路線直到抵達或 120 秒）前往對方的地盤巡查，提高交火機會。

### 14.7 介面
- **頭頂標記**（`ui/FactionMarkers.ts`）：中立 = 黃色菱形、友好 = 綠色菱形（附陣營小字）；口頭警告 = 橘色「！」、已被挑釁 = 紅色「！」；敵對的不顯示。只在 25m 內、相機到頭頂沒有被擋住（每 0.2 秒一次視線檢查）時顯示。是世界座標投影的浮層，不是 HUD 元素，所以不需要加入觸控版面。
- **基地**：新互動站「**陣營情報**」（南牆前，`hub.ts` 的 `faction`）→ `FactionPanel`：所屬企業與加成、五個陣營的聲望條（含 -20 / 0 / +40 刻度）、態度與說明、轉換企業；窄螢幕（874×402）可捲動。
- **時光機面板**：「各陣營對你的態度」五個小標籤，穩定度那行註明企業加成。**時代商行**新增「找人打點」分頁（`TraderPanel`）。**選擇企業**畫面（`CorpPanel`）。
- 企業穿越者的模型顏色（`FACTIONS[f].tint`）：晨星 = 白金、時穹 = 青藍、赤焰 = 紅。

### 14.8 第二階段準備
- 陣營關係、聲望門檻、聲望變化、打點與企業加成**全部在 `data/factions.ts`（純函式）與 `EconomyService`**（`chooseCorp / switchCorp / recordKill / bribe / attitudeToward / corpTruce`）；前端（AI、UI）只呼叫函式，不直接改 `Profile`，之後可以整層搬到伺服器。`Enemy` 對陣營的所有查詢走 `EnemyContext.factions`（`FactionCtx`：`playerCorp / attitude / hostile`），真人玩家同樣有所屬企業與聲望，規則與 NPC 一致（把另一個玩家當成一個 `Tgt` 即可）。
- 存檔：`PROFILE_VERSION` = 4（`corp`、`reputation`；`RaidState.truce / repDelta / bribed / compensation`；`RaidResult.repChanges / compensation`）。

### 14.9 測試
- 單元（`tests/factions.test.ts`）：關係表（含對稱與休戰）、聲望門檻與態度、初始聲望、聲望變化（殺人、友好 -25、夾限 ±100、友軍賠償與不扣成負數）、打點（+5、每場 +15、每個陣營各自的額度、下一場重置、需要舊台幣、被拒絕不扣錢）、企業（選擇一次、折扣、穩定度 +60、轉換費用與聲望重置）、存檔 migrate、休戰擲骰（固定 seed 可重現、比例約 40%）、挑釁（打中連同群組、2m 開槍、瞄準 1 秒警告 / 2 秒翻臉 / 15m 外不算 / 移開倒退）、Enemy 整合（中立不攻擊、盯著看、不被腳步引來、警衛與黑道互相鎖定並打到一方死亡、企業休戰與否、牆擋住不鎖定、只聽其他陣營的槍聲、友好警衛幫忙打黑道）。
- Playwright（`?debug=1`）：選擇企業畫面與加成、警衛 vs 黑道交火並留下屍體與槍聲引來旁觀者、中立警衛黃色標記 + 瞄準警告 / 翻臉、友好警衛不攻擊並幫忙、殺人後結算與重新整理保留、打點與上限、企業休戰與敵對、效能比較、手機 874×402 的陣營頁面。

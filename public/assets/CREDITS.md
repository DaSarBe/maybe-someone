# 素材來源與授權（CREDITS）

所有素材皆為 **CC0 1.0（公眾領域）**，使用上無需署名；仍在此註明來源。
唯一例外：`sounds/weapons/rifle_fire_*.ogg` 為 **CC BY 3.0**，須依下方「音效（OpenGameArt）」一節署名。
清單與路徑對應請見 `manifest.json`。

## 音效（Kenney，CC0 1.0）

| 檔案 | 原作 | 來源網址 | 授權確認 |
|---|---|---|---|
| sounds/footsteps/{concrete,wood,grass,carpet}/01–05.ogg | Kenney Impact Sounds（footstep_*） | https://kenney.nl/assets/impact-sounds | 鏡像：https://github.com/Boyquotes/kenney-impact-sounds-for-godot （LICENSE 為 CC0 1.0） |
| sounds/impacts/{metal,wood,flesh,generic}_01–05.ogg | Kenney Impact Sounds（impact_metal_light / impact_wood_light / impact_soft_medium / impact_generic_light） | 同上 | 同上 |
| sounds/ambient/machinery_hum.ogg | Kenney Sci-fi Sounds（engine_circular_000） | https://kenney.nl/assets/sci-fi-sounds | 鏡像：https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot （LICENSE 為 CC0 1.0） |
| sounds/ambient/time_rift.ogg | Kenney Sci-fi Sounds（force_field_000） | 同上 | 同上 |
| sounds/ui/*.ogg（click_001/002, select_001, confirmation_001, back_001, error_001, open_001, close_001, drop_001, pluck_001） | Kenney Interface Sounds | https://kenney.nl/assets/interface-sounds | 鏡像：https://github.com/Calinou/kenney-interface-sounds （檔案內授權文字為 CC0） |

註：ui 檔案由原 WAV 以 ffmpeg（libvorbis, q4）轉為 OGG，內容未修改。

## 3D 模型（Quaternius，CC0 1.0）

| 檔案 | 來源 |
|---|---|
| models/enemy_soldier.glb | Quaternius，經 npm 套件 @netforge/asset-library-files@0.2.0（library/lowpoly/soldier.glb） |
| models/enemy_robot_gunner.glb | 同上（robot_gunner） |
| models/npc_worker.glb | 同上（worker） |
| models/prop_crate.glb, prop_barrel.glb, prop_barrels.glb, prop_chest.glb, prop_cargo_ship.glb, prop_generator.glb, prop_fence.glb | 同上（crate / barrel / barrels / chest / cargo_ship / generator / fence） |
| models/bld_hangar.glb, bld_building_a.glb | 同上（hangar / building_a） |
| models/item_chronite.glb（時晶佔位，原 crystal） | 同上（crystal） |
| models/item_grenade.glb | 同上（grenade） |

來源說明：Quaternius 作者頁 https://poly.pizza/u/Quaternius ，套件頁 https://quaternius.com 。
上述 npm 套件的 NOTICE 聲明這些模型為 CC0 1.0 並附 Poly Pizza 模型頁；我方未能直接開啟 quaternius.com 或 poly.pizza 逐一核對（網路限制），以 NOTICE 為準。
該套件的 GLB 經 meshopt 壓縮（EXT_meshopt_compression）並縮圖/優化，原始網格與動畫未改動。

技術注意：GLTFLoader 需設定 `MeshoptDecoder`（three/examples/jsm/libs/meshopt_decoder.module.js）。

## 貼圖（Screaming Brain Studios，CC0 1.0）

| 檔案 | 來源 |
|---|---|
| textures/surface_{concrete,metal,wood,grass,gravel,dirt,plate,stone,wall,bark}.png | Screaming Brain Studios，OpenGameArt（Base Material Texture Pack 等 128px 版本）。經由 @netforge/asset-library-files@0.2.0（library/ps1/）取得。 |

參考：https://opengameart.org/content/base-material-texture-pack

## 音效（OpenGameArt）

下列作品頁面皆標示 License 為 CC0，除非註明為 CC BY 3.0。
所有音效已以 ffmpeg 裁切、轉為 mono 44.1kHz OGG（libvorbis q4）；音量已調整以避免削波。

| 檔案 | 原作 | 作品頁 | 授權 | 備註 |
|---|---|---|---|---|
| sounds/footsteps/gravel/01.ogg | DifferentSteps（gravel.ogg），作者 TinyWorlds | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud | CC0 | 單一步 |
| sounds/footsteps/gravel/02–04.ogg | 100 CC0 SFX v2（stones_01/02/03），作者 rubberduck | https://opengameart.org/content/100-cc0-sfx-2 | CC0 | 原為石頭音效，當作碎石使用 |
| sounds/footsteps/water/01–03.ogg | 100 CC0 SFX v2（footstep_wet_01/02/03），作者 rubberduck | https://opengameart.org/content/100-cc0-sfx-2 | CC0 | |
| sounds/footsteps/{metal,metal_hollow,metal_grate}/01–09 / 01–08 / 01–08.ogg | Metal footsteps on concrete（metal_steps_01–25.wav），作者 Thimras | https://opengameart.org/content/metal-footsteps-on-concrete | CC0 | 25 步平均分三組，轉單聲道 44.1kHz、去頭尾靜音、正規化後，各自疊加本專案合成的特色層：metal 低頻共鳴（鐵板）、metal_hollow 空心咚咚與殘響（貨櫃頂）、metal_grate 高通濾波加細小碰撞與清脆泛音（格柵）。疊加層為本專案自製 |
| sounds/footsteps/sand/01–05.ogg | Water splash and sand footsteps（sand_footsteps_0.mp3），作者 Peludo | https://opengameart.org/content/water-splash-and-sand-footsteps | CC0 | 由一段連續錄音依靜音切出 5 步 |
| sounds/weapons/pistol_fire_01–04.ogg | Gunshots（22 Pistol.wav / 22 Magnum.wav），作者 kurt | https://opengameart.org/content/gunshots | CC0 | 原檔為多發連續錄音（含回音），依靜音切出單發 |
| sounds/weapons/rifle_fire_01–03.ogg | Gunshot sounds（sounds.zip 內 sks.wav） | https://opengameart.org/content/gunshot-sounds | **CC BY 3.0** | 署名：Vincent Sevedge（sounds.zip 內 creativecommons.txt 所載，「Audio and Visual content is covered under the Creative Commons Attribution 3.0 Unported License」，http://creativecommons.org/licenses/by/3.0/）。注意：OGA 作品頁標示 CC0 且列作者為 Tabasco，與壓縮檔內的授權文字不一致，依較保守的 CC BY 3.0 處理並署名。 |
| sounds/weapons/reload_01–02.ogg | Gun reload sounds（gunreload1.wav / assaultriflereload1_0.wav），作者 SpringySpringo | https://opengameart.org/content/gun-reload-sounds | CC0 | |
| sounds/weapons/reload_03.ogg | Handgun reload sound effect（reload.wav），作者 zer0_sol | https://opengameart.org/content/handgun-reload-sound-effect | CC0 | |
| sounds/ambient/harbor_wind.ogg | Wind whoosh loop（wind woosh loop.ogg），作者 SketchMan3 | https://opengameart.org/content/wind-whoosh-loop | CC0 | 原檔約 6 秒，以交叉淡化接成可循環的約 10 秒音效；作為港口風聲為近似替代 |
| sounds/ambient/indoor_room_tone.ogg | Sci-fi ambience SFX（SFX SCI FI Computer room ambience），作者 Fun Gi Development | https://opengameart.org/content/sci-fi-ambience-sfx | CC0 | 以交叉淡化處理為循環；作為室內環境音為近似替代 |

未使用的素材（授權不符或無法取得）：
- The Free Firearm Sound Library（CC0，194 MB，僅提供 .7z；本次無法解壓，未使用）。其餘 .7z 來源（Fantozzi footsteps）同樣因無法解壓而未使用。
- CC-BY 3.0 以上、CC-BY-SA、GPL 來源（如 Gary Guns / Q009 / Red Eclipse / Shotgun Shoot Reload / 2 Metal Weapon Clicks / Footsteps on different surfaces 等）皆未使用。
- Gunshot sounds 的 sounds.zip 中 cz.wav、mosin.wav、shotty.wav 未使用（授權文字與 CC0 標示不一致，僅取用 sks.wav 並署名）。

## 音效與貼圖（本次新增，CC0 或原創生成）

音效來源：**The Essential Retro Video Game Sound Effects Collection [512 sounds]**，作者 Juhani Junkala，
作品頁 https://opengameart.org/content/512-sound-effects-8-bit-style ，授權 **CC0 1.0**（壓縮檔內 INFO.txt 亦載明 CC0，「You can do anything you want with these sounds」）。
原檔為 44.1kHz 16-bit mono WAV，以 ffmpeg 去頭尾靜音後轉為 mono 44.1kHz OGG（libvorbis q4）。

| 檔案 | 原作檔名（512 sounds 壓縮檔內） | 備註 |
|---|---|---|
| sounds/sfx/time_machine_depart.ogg | Movement/Portals and Transitions/sfx_movement_portal2.wav | 時光機啟動（約 2.0 秒） |
| sounds/sfx/time_machine_arrive.ogg | Movement/Portals and Transitions/sfx_movement_portal6.wav | 抵達（約 1.7 秒），與 depart 為不同素材 |
| sounds/sfx/stability_warning.ogg | General Sounds/Alarms/Alarms/sfx_alarm_loop1.wav | 警告聲，可重複播放（約 0.8 秒） |
| sounds/sfx/extract_success.ogg | General Sounds/Positive Sounds/sfx_sounds_powerup1.wav | 撤離成功（約 0.8 秒） |
| sounds/sfx/death.ogg | General Sounds/Weird Sounds/sfx_sound_vaporizing.wav | 被時空吞噬（約 1.9 秒） |
| sounds/sfx/container_open.ogg | General Sounds/Interactions/sfx_sounds_interaction3.wav | 開箱/櫃（約 1.0 秒） |
| sounds/ui/equip_001.ogg | General Sounds/Interactions/sfx_sounds_interaction19.wav | 裝備（約 0.17 秒），非布料/金屬扣的實錄，為近似替代 |
| sounds/ui/sell_001.ogg | General Sounds/Coins/sfx_coin_cluster1.wav | 販售（約 0.7 秒） |
| sounds/ui/buy_001.ogg | General Sounds/Coins/sfx_coin_single2.wav | 購買（約 0.17 秒） |

`sounds/sfx/search_rummage.ogg`：**本專案以 ffmpeg 程式合成**（pink noise 經帶通濾波與 tremolo 調變，約 1.6 秒，可循環），未使用任何第三方錄音。

貼圖 `textures/scifi_floor.png`、`textures/scifi_wall.png`（512×512，可平鋪）：**本專案以 Python（numpy/Pillow）程式生成**，無外部來源，屬本專案原創。

## 不符合 CC0 而未使用的素材

- Poly Pizza 上標示 CC-BY 的模型（依套件 NOTICE 亦未收錄）。
- 來源不明或僅提供於 sfxmint / lotsofsounds 等需 API 金鑰的服務之音效。

## 尚缺

見 `manifest.json` 的 `missing`：金屬/泥土/磁磚腳步聲、空槍（dry_fire）音效、子彈命中水泥音效、古董花瓶/電池/晶片模型、槍械模型。
（手槍/步槍/換彈與港口風聲、室內環境音已由上方 OpenGameArt 音效補上。）

## M4 新增素材（素材助理，2026-11）

**注意**：本批音效是依波形切段與檔案中繼資料挑選，**尚未經人工試聽確認**。請在合併前試聽 `sounds/enemy/*`、`sounds/impacts/player_flesh_*`、`sounds/ambient/*` 並替換不合適者。

### 3D 模型

| 檔案 | 原作 | 來源網址 | 授權 | 格式／備註 |
|---|---|---|---|---|
| models/weapons/weapon_pistol.obj（+ .mtl） | Quaternius，FPS Pack，Pistol | https://opengameart.org/content/low-poly-animated-guns | CC0 1.0 | OBJ+MTL，約 1.5k 三角面，無貼圖（僅 MTL 材質色）。原檔為 OBJ，未轉換。 |
| models/weapons/weapon_smg.obj（+ .mtl） | Quaternius，FPS Pack，P90（作為 SMG／PDW 使用） | 同上 | CC0 1.0 | OBJ+MTL，約 0.95k 三角面 |
| models/weapons/weapon_rifle.obj（+ .mtl） | Quaternius，FPS Pack，Rifle | 同上 | CC0 1.0 | OBJ+MTL，約 1.9k 三角面 |
| models/weapons/weapon_shotgun.obj（+ .mtl） | Quaternius，FPS Pack，Shotgun | 同上 | CC0 1.0 | OBJ+MTL，約 1.0k 三角面 |
| models/harbor/prop_pallet.obj | drummyfish，32 low poly models（pallet） | https://opengameart.org/content/32-low-poly-models | CC0 1.0（檔案註解亦載明） | OBJ，324 面，無 MTL |
| models/harbor/prop_truck.glb | Quaternius（經 npm @netforge/asset-library-files，library/lowpoly/truck.glb） | https://poly.pizza/u/Quaternius | CC0 1.0 | glb，EXT_meshopt_compression |

武器 OBJ 為 Quaternius FPS Pack 的 OBJ 版本，同包另有 FBX 與 .blend，未使用。

### 音效

| 檔案 | 原作 | 來源網址 | 授權 | 備註 |
|---|---|---|---|---|
| sounds/enemy/hurt_01–04.ogg | thebardofblasphemy，Grunts male death and pain（death pain grunts.wav 內的短促段落） | https://opengameart.org/content/grunts-male-death-and-pain | CC0 1.0 | 依靜音切段，未試聽 |
| sounds/enemy/death_01–03.ogg | 同上（較長段落） | 同上 | CC0 1.0 | 依靜音切段，未試聽 |
| sounds/enemy/alert_01.ogg | TaniCorn，Male "Hey" | https://opengameart.org/content/male-hey | **CC-BY 4.0** | **須署名**：「Hey」語音由 TaniCorn 製作，授權 CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。已修剪靜音並正規化。 |
| sounds/impacts/player_flesh_01.ogg | Spring Spring，Various sound effects（snd_bullethit.wav） | https://opengameart.org/content/various-sound-effects-0 | CC0 1.0 | |
| sounds/impacts/player_flesh_02.ogg | 同上（player_hit.wav） | 同上 | CC0 1.0 | |
| sounds/impacts/player_flesh_03.ogg | qubodup（wet towel on body，經 OGA 頁面），wet_towel_on_body-03 | https://opengameart.org/content/40-wet-towel-clubpoundhitattack-sounds | CC0 1.0 | 非槍彈擊中，以濕毛巾拍打身體代用 |
| sounds/impacts/player_flesh_04.ogg | Independent.nu（submitted by qubodup），Hits and punches（hit10） | https://opengameart.org/content/37-hitspunches | CC0 1.0 | 拳擊聲代用 |
| sounds/ambient/ship_horn.ogg | Musheran，Foghorn（kinda gross） | https://opengameart.org/content/foghorn-kinda-gross | CC0 1.0 | 船笛 |
| sounds/ambient/seagulls.ogg | Rango Mango，Solo seagull sound effects（Seagull Ambient 1–4 依序接合，間隔 0.5 秒） | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 不可循環（單次播放的海鷗叫聲序列） |
| sounds/ambient/waves.ogg | yd，ocean waves（oceanwaves.zip，取 20–36 秒段，末端交叉淡化成可循環） | https://opengameart.org/content/enemy-ship-approaching | CC0 1.0 | 14 秒可循環 |

### 尚缺（M4 未找到合適的 CC0 來源）

- `weapons.casing`（彈殼掉落）、`weapons.bullet_flyby`（子彈飛過耳邊）、`impacts.player_armor`（子彈打到護甲的金屬聲）
- `enemy.alert` 第 2、3 段（目前只找到一段 CC-BY 的「Hey」）
- 模型：貨櫃、起重機、堆高機、路燈、繫纜樁。已排除的候選：container-0 與 shipping-containers-low-poly（僅 .blend，或授權說明與頁面標示不一致）、forklift（.blend，CC-BY 4.0）、lamp-post（僅 PNG）。
- 已排除：CC-BY 3.0 的 soldier voice acting、11-male-human paindeath（CC-BY 3.0）、aargh-male-screams（CC-BY 3.0）；僅 `.blend` 的 oil drum、wooden pallet、smg 等。

## 槍械配件（素材助理，2026-11-20）

全部為 **CC0 1.0**，無需署名；未使用 CC-BY 素材。檔案未轉換，保留原格式；未經試裝或目視確認，合併前請在遊戲中試裝並檢查比例。

| 檔案 | manifest key | 原作 | 來源網址 | 格式 | 三角形數 | 備註 |
|---|---|---|---|---|---|---|
| models/attachments/Scope_1.obj（+ .mtl） | att_scope2x | Quaternius，Ultimate Gun Pack（July 2019），Accessories/Scope_1 | https://opengameart.org/content/low-poly-guns-pack （檔案 ultimate_gun_pack_by_quaternius.zip） | OBJ+MTL | 412 | 2 倍鏡為依尺寸的推測，未目視確認 |
| models/attachments/Scope_2.obj（+ .mtl） | att_scope4x | 同上，Accessories/Scope_2 | 同上 | OBJ+MTL | 468 | 4 倍（狙擊）鏡為依尺寸的推測，未目視確認 |
| models/attachments/Silencer_1.obj（+ .mtl） | att_suppressor | 同上，Accessories/Silencer_1 | 同上 | OBJ+MTL | 248 | 全長消音器 |
| models/attachments/Grip.obj（+ .mtl） | att_grip | 同上，Accessories/Grip | 同上 | OBJ+MTL | 796 | 垂直前握把 |
| models/attachments/Flashlight.obj（+ .mtl） | att_flashlight | 同上，Accessories/Flashlight | 同上 | OBJ+MTL | 156 | 手電筒（額外項目） |
| models/attachments/RedDot_East.glb | att_reddot | Pichuliru，CC0 Flat Gun Attachments | https://opengameart.org/content/cc0-flat-gun-attachments | glb（無外部貼圖） | 440 | 紅點鏡，East 變體（磚紅色鏡片）；West 變體同包 |
| models/attachments/Holographic_East.glb | att_holo | 同上 | 同上 | glb | 432 | 全息瞄具，East 變體 |
| models/attachments/Laser_East.glb | att_laser | 同上 | 同上 | glb | 314 | 雷射模組，East 變體 |

來源說明：Quaternius 的 Ultimate Gun Pack 隨 OGA「Low Poly Guns Pack」頁面（作者 quaternius，授權 CC0）發佈；與現有 FPS Pack 同一作者，風格一致，因此優先使用。Quaternius 的 OBJ 單位與 Pichuliru 的 GLB 不同（以 Rifle 約 9.6 單位長推估，OBJ 約為 GLB 比例的 10 倍），整合時需個別縮放。

未找到的項目（見 manifest.json `missing`）：
- 槍口制退器（att_compensator）：無 CC0 來源。
- 擴容彈匣（att_mag_ext）：無 CC0 來源（Violence 的 itch.io 套件為 CC0 且有彈匣部件，但不在允許的來源內，未使用）。
- 倍鏡鏡框遮罩、紅點發光點、全息圓圈貼圖：未找到 CC0 PNG，已跳過，可由程式繪製。

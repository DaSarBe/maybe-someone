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
| sounds/footsteps/sand/01–05.ogg | Water splash and sand footsteps（sand_footsteps_0.mp3），作者 Peludo | https://opengameart.org/content/water-splash-and-sand-footsteps | CC0 | 由一段連續錄音依靜音切出 5 步 |
| sounds/weapons/pistol_fire_01–04.ogg | Gunshots（22 Pistol.wav / 22 Magnum.wav），作者 kurt | https://opengameart.org/content/gunshots | CC0 | 原檔為多發連續錄音（含回音），依靜音切出單發 |
| sounds/weapons/rifle_fire_01–03.ogg | Gunshot sounds（sounds.zip 內 sks.wav） | https://opengameart.org/content/gunshot-sounds | **CC BY 3.0** | 署名：Vincent Sevedge（sounds.zip 內 creativecommons.txt 所載，「Audio and Visual content is covered under the Creative Commons Attribution 3.0 Unported License」，http://creativecommons.org/licenses/by/3.0/）。注意：OGA 作品頁標示 CC0 且列作者為 Tabasco，與壓縮檔內的授權文字不一致，依較保守的 CC BY 3.0 處理並署名。 |
| sounds/weapons/reload_01–02.ogg | Gun reload sounds（gunreload1.wav / assaultriflereload1_0.wav），作者 SpringySpringo | https://opengameart.org/content/gun-reload-sounds | CC0 | |
| sounds/weapons/reload_03.ogg | Handgun reload sound effect（reload.wav），作者 zer0_sol | https://opengameart.org/content/handgun-reload-sound-effect | CC0 | |
| sounds/ambient/harbor_wind.ogg | Wind whoosh loop（wind woosh loop.ogg），作者 SketchMan3 | https://opengameart.org/content/wind-whoosh-loop | CC0 | 原檔約 6 秒，以交叉淡化接成可循環的約 10 秒音效；作為港口風聲為近似替代 |
| sounds/ambient/indoor_room_tone.ogg | Sci-fi ambience SFX（SFX SCI FI Computer room ambience），作者 Fun Gi Development | https://opengameart.org/content/sci-fi-ambience-sfx | CC0 | 以交叉淡化處理為循環；作為室內環境音為近似替代 |

未使用的素材（授權不符或無法取得）：
- The Free Firearm Sound Library（CC0，194 MB，僅提供 .7z；本次無法解壓，未使用）。其餘 .7z 來源（Metal footsteps on concrete、Fantozzi footsteps）同樣因無法解壓而未使用。
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

# 素材來源與授權（CREDITS）

所有素材皆為 **CC0 1.0（公眾領域）**，使用上無需署名；仍在此註明來源。
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

## 不符合 CC0 而未使用的素材

- Poly Pizza 上標示 CC-BY 的模型（依套件 NOTICE 亦未收錄）。
- 來源不明或僅提供於 sfxmint / lotsofsounds 等需 API 金鑰的服務之音效。

## 尚缺

見 `manifest.json` 的 `missing`：金屬/碎石/泥土/水/磁磚/沙地腳步聲、手槍/步槍/空槍/換彈音效、港口風聲、古董花瓶/電池/晶片模型、槍械模型。

# Chronicle 插画与壁纸 · 2026-10

三张内置 imagegen 生成的原创场景插画；不是历史照片或科学结构图。对应已有里程碑，不新增历史事实。生成原图 1536×1024，保存在 `moments/`。本批将独立配图由 96 张补充到 99 张；49 个时代的已有图片和所有已配置里程碑图片均已检查，无缺文件。

| 里程碑 | 中文标题 | English title | 手机裁切 FOCUS_X |
|---|---|---|---|
| difference-engine | 齿轮中的计算 | Computing in Brass | 0.60 |
| dna-double-helix | 生命的双螺旋 | The Double Helix of Life | 0.52 |
| jwst-launch | 望向宇宙黎明 | Looking toward Cosmic Dawn | 0.65 |

## 文件与复现

- 网页插画：`apps/web/public/media/art/moments/<id>-{800,1600}.webp`，使用 `tools/make-art.sh tools/art/chronicle-2026-10` 转换。
- 视差：`uv run tools/make-depth.py apps/web/public/media/art/moments`。
- 壁纸：`wallpapers/<id>-desktop.jpg`（3840×2160）、`<id>-phone.jpg`（2160×3840）、`<id>-preview.webp`（1600×900）。使用现有 `tools/make-wallpaper.sh`，Real-ESRGAN x4plus 放大、裁切、默认颗粒和 e-acc.ai 水印；不是原生 4K 生成。
- 复现壁纸：`REALESRGAN=/path/to/realesrgan-ncnn-vulkan FOCUS_X=<上表> tools/make-wallpaper.sh tools/art/chronicle-2026-10/moments/<id>.png tools/art/chronicle-2026-10/wallpapers`。
- 文件准备完毕后通过 `/admin/wallpapers` 上传三件套，选择未占用的上线日期。原图只走现有订阅积分下载机制，不放入 public。此素材包没有向生产后台上传或安排发布日期。

## 最终生成提示词

### difference-engine

Create one exquisite historical-scene illustration for a history-of-progress website, depicting Charles Babbage's difference engine in an 1830s London workshop. Authentic Victorian engineering copperplate engraving, finely crosshatched sepia ink on warm ivory paper, restrained brass gold accents. A mechanically plausible monumental stack of brass decimal gears and vertical number-wheel columns occupies the center-right, wooden workbench, tall softly illuminated windows, one tiny anonymous engineer viewed from behind. Wide landscape 3:2 composition, calm darker left and lower third for website text overlay, detailed coherent central subject also suitable for portrait crop. No lettering, digits, captions, logos or watermark, no modern screens. Premium museum print, beautifully controlled architectural perspective, generous atmosphere. Output at highest available resolution.

### dna-double-helix

Use case historical-scene. Create an original premium illustration of the discovery of the DNA double helix in 1953, not a documentary photograph. Mid-century scientific magazine gouache painting, muted petrol blue, warm ivory, copper, subtle paper texture. An elegant physically coherent right-handed DNA double-helix molecular model built from metal rods and colored wooden spheres, two continuous sugar-phosphate backbones and orderly paired rungs, stands on a wooden laboratory table at center. A single square monochrome X-ray diffraction film with a faint X pattern rests nearby, glass laboratory bottle and warm desk lamp, quiet Cambridge laboratory window behind, no recognizable scientists. Restrained detail, thoughtful atmosphere of discovery, beautiful natural shadow, no dense random molecular tangle. Landscape 3:2 composition, central sculpture reads clearly also in a portrait crop, lower third subdued for overlay text. No readable text, letters, numbers, logos, watermark or labels. Highest available resolution.

### jwst-launch

Use case stylized-concept, scientifically informed space engineering art. One stunning premium illustration celebrating the James Webb Space Telescope launched in 2021. Clearly an artist's impression of the deployed telescope in deep space: a coherent honeycomb primary mirror of exactly 18 gold hexagonal segments, dark secondary mirror support struts, five broad layered silver kite-shaped sunshield membranes below, viewed at an elegant oblique angle. The gold mirror centered slightly right above the silvery sunshield, entire spacecraft kept within the central 55 percent so a portrait crop can retain the subject. Huge dark navy negative space and faint distant stars, a gentle amber rim light from off frame, no visible nearby Earth, no nebula clutter. Contemporary high-end aerospace concept painting with meticulous restrained detail, warm gold against silver and deep ink blue. Landscape 3:2, lower third and left side calm for website typography. No words, letters, numbers, logos, watermark or flags. Highest available resolution.

## 本批验证

- 基于更新后的 main `6718a3a`；类型检查、Web 构建通过。
- 前端测试：151 通过、1 跳过、0 失败。
- 49 个时代 + 99 个已配图里程碑的 296 个 WebP 均可解码且宽度符合 800/1600 规格；3 张新深度图已生成。
- 9 个壁纸文件尺寸检查通过，3 个手机裁切逐张目视检查。
- 使用真实 chronicle JSON 和隔离 HTTP 测试夹具预览，三张新图对应页面均为 200、图片成功加载；检查桌面观测舱及 390px 手机布局。该预览不代表生产或完整 API 验收。
- 完整数据库测试未通过：默认本地 5432 认证失败，现有 `.env` 的本地 55432 无服务监听；未改数据库配置。整站 smoke 未通过：localhost:3000 没有运行完整站点。

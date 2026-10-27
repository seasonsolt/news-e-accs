# 历史背景错配配图修复

## `dinosaurs-mammals` → `epochs/triassic-life-v2`

巡检原图发现同一场景混用了三角龙、长颈巨型蜥脚类和白垩纪末撞击流星，但该时代从约2.33亿年前起。新图选择晚三叠世的连贯生态场景：早期小型双足恐龙、犬齿兽、蕨类、木贼和针叶树，以博物馆自然史油画呈现。没有三角龙、巨型蜥脚类、流星或花草。

事实依据：[Natural History Museum：早期恐龙](https://www.nhm.ac.uk/discover/where-did-dinosaurs-come-from.html)、[Brachiosaurus生活在约1.52—1.45亿年前](https://www.nhm.ac.uk/discover/dino-directory/brachiosaurus.html)。时代名称与总述仍概括后续演化，画面只重建时代早期，不把整个时代的动物混成同一现场。

## `nvidia-openai-ohio` → `moments/ohio-compute-plan-v2`

原图把2026年8月融资规划画成冬季雪地中已建成并运行的大园区。新图是明确的编辑概念插画：桌上的通用园区模型和图纸、窗外夏季俄亥俄农田；户外没有已建园区。它既不是现场照片，也不是项目正式设计图。融资规模与事件日期保留既有数据，本次仅校正图像表达，不新增未经核实的工程进度。

## 素材与验证

- 两图均由内置 `image_gen` 分别生成，逐图完整提示词在对应的 `.prompt.txt`；原始 PNG 保存在本目录的 `epochs/` 和 `moments/`。
- 人工目视核查后，用 `cwebp` 质量76生成800/1600两档WebP；Depth Anything V2 Small在只含这两张图的独立临时目录生成800像素深度图。
- 数据引用局部更新 `eras.json`、`milestones.json`，同步英文画风和 `docs/art-prompts.md`。
- 删除网页目录中旧 `epochs/dinosaurs-mammals-{800,1600,depth}.webp` 和 `moments/nvidia-openai-ohio-{800,1600,depth}.webp`，避免停用素材残留。源码、JSON和文档核对发现，网页运行时无其他消费者；事件/时代ID保持原值，同名数据键不属于图片引用。
- `tools/art/phone-editions-2026-10/manifest.json` 是壁纸替换前映射，仍需追溯原作品。因此仅把两条历史快照的 `source` 改指本包 `retired/` 归档的旧1600图，保留快照的原 `art`、画风、文件名与手机衍生作品；不将新配图误记为那些旧壁纸的原图。

# 新增历史节点与已有节点补图 · 2026-10-27

本批为四个新增节点配图，并为两个已有节点补齐独立图片，共六张原创位图。均使用内置 imagegen 独立生成，原图为 1536×1024；生成模式为全新插画，不是历史照片、器物复刻或工程施工图。各图完整最终提示词保存在 `moments/<id>.prompt.txt`，原图保存在同目录的 `<id>.png`。

| 节点 ID | 场景与视觉复核 | 画风 |
|---|---|---|
| `diamond-sutra` | 唐代作坊的整版刷印、薄纸和横卷；已检查没有活字、螺旋压机或现代装订书。人物与敦煌壁画背景为历史题材重构，不指称已知实际印刷作坊。 | 唐代敦煌设色与木版线描 |
| `jacquard-loom` | 木制织机、上置机械提花装置、穿孔卡链、经线和花纹丝织物；已检查没有电机、电子控制和现代金属流水线。独立复核发现初版左窗外误画后世富维耶四塔大教堂，已用内置 imagegen 局部改为树坡及低矮石屋，并重导出两种 WebP 和本张深度图。机械为场景示意，不作为可制造结构图。 | 十九世纪初手工设色工程铜版画 |
| `manchester-baby` | 开放机架、真空管、圆形 CRT 和朴素实验室；已检查没有现代键盘、个人电脑或集成电路。是基于时期硬件特征的摄影风格插画，未宣称精确复刻 1948 年现场机架布局。 | 1940 年代英国工业纪实灰度摄影插画 |
| `mosfet` | 小型硅实验器件、金属探针、显微镜、模拟仪表，以及不带标签的金属／氧化物／硅结构放大示意；已检查没有 1947 年金箔双点接触结构、现代大晶圆和数字屏幕。放大剖面是原理概念，不是早期器件的尺寸或结构证据。 | 1950 年代科学杂志精密技术插画 |

另补两张已有节点，事件原有日期、标题与事实描述不变：

| 已有节点 ID | 场景与视觉复核 | 画风 |
|---|---|---|
| `ada-lovelace-program` | 1843 年服饰的女性数学研究者、羽毛笔、手稿表格与抽象算法步骤，远处仅小型齿轮模型；没有已完成的分析机或电子电脑。人物为时期场景示意，不指称洛夫莱斯特定肖像；手稿不作为 Note G 的原件复刻。 | 1840 年代维多利亚钢版蚀刻 |
| `turing-machine` | 1930 年代研究者面前的纸上墨线图：离散方格长纸带、抽象符号和单个读写头；读写头清楚画在纸上，是数学思想实验，没有实体设备、Bombe、Enigma 或现代电脑。 | 1930 年代学术摄影风格与墨线示意 |

两张补图的历史约束依据：[科学博物馆 1843 年《分析机概述》馆藏](https://collection.sciencemuseumgroup.org.uk/objects/co8652385/book-sketch-of-the-analytical-engine-invented-by-charles-babbage-esq)、[科学博物馆洛夫莱斯人物记录](https://collection.sciencemuseumgroup.org.uk/people/cp38764/ada-lovelace)、[剑桥国王学院图灵历史介绍](https://www.kings.cam.ac.uk/alan-mathison-turing-1912-54)。前两项支持 1843 年译文及笔记，国王学院介绍明确 1936 年论文中的纸带计算模型；图片均不声称再现当时实际工作现场。

六张已逐张查看生成原图，确认主体、画风、时代约束和 3:2 构图。下方留出较安静区域供网页叠加图注，画面无品牌标记、水印或可读正文。

雅卡尔图的窗外地标修订依据：[富维耶圣母院官方建设史](https://www.fourviere.org/fr/vie-du-site-notre-dame-de-fourviere/lhistoire/de-la-construction-de-la-basilique-a-nos-jours/)载明 1872 年奠基，因此不能出现在 1804 年场景中。修订后再次查看原图，确认四塔教堂已移除，织机、卡链、人物和室内主体保留。完整局部编辑提示词附在同一 `jacquard-loom.prompt.txt` 后，最终交付为修订版。

网页输出为 `apps/web/public/media/art/moments/<id>-{800,1600}.webp`，使用 `cwebp -q 76` 压缩。深度图使用仓库 `tools/make-depth.py` 的 Depth Anything V2 Small 在独立批目录 `.data/chronicle-audit/new-event-depth/`（四个新增节点）和 `.data/chronicle-audit/existing-event-depth/`（两个已有节点）生成后复制到相同 public 目录，命名 `<id>-depth.webp`；未复用旧素材的深度图。

事件事实、日期措辞和一手来源由 `docs/chronicle/history-additions-2026-10-27.md` 记录；图片不用于支撑比这些来源更强的历史断言。

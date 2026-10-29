# 加速史场景

从加速史的时代画卷或里程碑插画"走进去"的三维场景。界面沿用观测舱的主题、字体、黄铜按钮和说明面板。

| 场景 | 地址（中文在前面加 `/zh`） | 时代 `era` / 里程碑 | 可以操作的内容与目标 |
|---|---|---|---|
| 2026 智能体工坊 | `/chronicle/agents` | `agents` | coding 工作台、三扇连续全景窗；推进任务换景并探索机架和冷却回路 |
| 约 330 万年前石器工坊 | `/chronicle/stone-tools` | `homo-stone-tools` | 锤石打制、石核断面与剥落石片 |
| 约 100 万年前火的工坊 | `/chronicle/fire` | `taming-fire` | 余烬、添细枝、添木柴、持续照料；火焰、火星与岩壁光照联动 |
| 约 1.2 万年前农业工坊 | `/chronicle/agriculture` | `agricultural-revolution` | 播种、生长、收获、储粮；查看磨盘与陶器 |
| 1822 差分机工坊 | `/chronicle/difference-engine` | 里程碑 `difference-engine` | 转动手柄计算平方数表 |
| 文字工坊 | `/chronicle/writing` | `cities-writing` | 选择谷物或羊群与一至五份数量；按每局随机抽出的三笔委托依次登记 |
| 铁器工坊 | `/chronicle/iron` | `iron-age` | 加炭、鼓风、锤击与冷却；在可锻状态完成两次有效锤击，再冷却成形 |
| 印刷工坊 | `/chronicle/printing` | `printing` | 排字、校对、上墨和压印；每份重新上墨，完成三张书页 |
| 观星工坊 | `/chronicle/observatory` | `scientific-revolution` | 对照星图调整方向与焦距；星图给出月面、木星、金星各自随机的刻度，正确记录三次观察 |
| 蒸汽工坊 | `/chronicle/steam` | `steam-age` | 配合汽阀与负载，让压力和转速同时达到目标；三个工况每局随机，每个连续测试两次 |
| 电光工坊 | `/chronicle/electric` | `electric-age` | 选择目标接点、合上开关并测试；按状态牌上随机的顺序点亮三支灯，短接会断开保护开关 |
| 飞行试验工坊 | `/chronicle/flight` | `combustion-flight` | 按配平卡（每局随机三张）移动重心、调整升降舵，再试飞；通过三段不同配平检验 |
| 逻辑电路工坊 | `/chronicle/logic` | `transistor-computer` | 设置输入 A、B 并预测输出；按随机的行序逐行正确检验 AND 的四行真值表 |
| 轨道对接工坊 | `/chronicle/space` | `space-age` | 平移与偏航使位置和姿态对正后推进；起始偏差与检查点扰动每局随机，克服后完成三段接近与软对接 |
| 网络分片工坊 | `/chronicle/network` | `internet` | 按一、二、三选择分片，并为每片选择可用路径；每片断开的线路每局随机，绕开断路，完整重组消息 |

智能体、石器、用火和农业四个工坊共用 `web/shared/page.tsx` 的界面和 `experience.ts` 的相机、操作点、阶段控制与 iframe 交接。`studio.ts` 搭建现代工作室，用火、农业和石器分别在各自的 `scene.ts` 搭建，扫描模型与自然材质的加载、地形及树枝几何由 `shared/scan-assets.ts`、`natural-assets.ts`、`natural-geometry.ts` 共用。每个场景的取景、对象和阶段变化独立。支持拖动环视、滚轮走近、WASD/方向键移动、物件拾取、单步、自动演示、暂停、复位和阶段选择；减少动态效果时相机与阶段直接切换，环境动画停止。失焦、切到后台或打开说明时暂停自动演示。

开发运行见仓库 `docs/deploy.md`；`npm run dev:web` 连接本地 API。新增场景没有新增接口、数据库、环境变量或浏览时模型调用。初版验证见 [这一批工坊的验收记录](evidence/workshops-2026-10/verification.md)，石器画质修订见 [石器精细化验证](evidence/stone-refinement-2026-10/verification.md)，其余三个工坊见 [2026、用火与农业精细化验证](evidence/three-workshops-refinement-2026-10/verification.md)。2026 的极客设备见 [弧面工作台验证](evidence/agents-workbench-2026-10/verification.md)，最新连续窗景与光影见 [虚拟全景窗验证](evidence/agents-virtual-windows-2026-10/verification.md)。

## 怎么进入

- 桌面端（宽度 ≥ 961px、有鼠标、没有关闭动效）：`/chronicle` 的插画由纵深隧道绘制（`apps/web/app/features/chrono/depth-tunnel.ts`）。停在有场景的里程碑上时，隧道在观测舱里用同样大小的 iframe 预先打开 `<场景地址>?embed`，场景暂停在原画视角；读者点「走进工坊」后两边按 `scene-handoff.ts` 的消息交接（`ready` → `enter` → `entered`，返回时 `exit`），只接受同源、来自对方窗口的消息。
- 其他情况（手机、触屏、关闭动效、没有 WebGL）：「走进工坊」是普通链接，打开场景的独立页面；手机上也显示这个入口。
- 场景页自己画全部界面（路由 `handle` 的 `bare`），不带站点导航。three.js 只在场景页和桌面端隧道里按需加载，服务端不渲染画布。

场景列在 `scenes.ts`：`id` 是 `web/<id>/` 的目录名，`milestone` 是 `industry/chronicle/milestones.json` 里的里程碑，`era` 是 `eras.json` 的时代，二者可同时设置。`label` 是入口按钮的文字。`web.tsx` 把它们交给加速史页面（`WebModule.chronicle.scenes`）。入口按正在显示的画卷关联：时代画卷可在整个时代进入，独立配图的里程碑只进入自己配置的场景。隧道使用 `e-<era>` / `m-<milestone>` 区分相同名称的时代与事件。

2026 工坊对应当前的 `agents` 时代，在没有独立事件配图的时刻（包括当前时刻）可从时代画卷进入。石器、用火与农业同时关联各自的时代与配图里程碑。原有差分机入口保持在 1822 年。新增十个挑战分别关联上表的时代画卷，其时间入口与代表装置由各自 catalog 说明。

## 十个时代挑战

文字至网络的十个工坊是可以操作失败、修改后重试、完成后复位重玩的小游戏。它们与原有智能体、石器、用火、农业的有限四阶段演示分开：挑战的四段文字用于解释当前进展，不能点击阶段直接领取完成。差分机仍沿用自己的有限差分计算。

每个挑战有独立的纯状态规则（`web/games/craft-state.ts`、`science-state.ts`、`modern-state.ts`）和 `GameController`。主按钮读取 `snapshot().primary` 的操作 ID，提交当前选择或执行一次操作，不会自动选择正确答案；选择货物、调刻度、接回路等准备步骤由读者完成。只有明确启动「自动演示」才调用 `demo()` 展示正确流程。控制按钮与带 `Spot.action` 的三维实体都通过同一个 `act()` 检查规则。

错误会显示具体反馈，保留已经取得的有效记录，允许改正再试；完成后显示结果并停止自动演示。复位会清空本次设置和进度，并重新抽取目标。

`GameSnapshot.tone`（`info`、`progress`、`error`）决定状态点与状态行的颜色；出错时面板轻微抖动，变化的读数短暂高亮，减少动态效果时只保留颜色。状态行与说明文字按最长的一段预留高度，操作按钮的位置不随文字变化。

## 每局随机目标与进度

文字的委托、观星的三个刻度、蒸汽的三个工况、电光的点灯顺序、飞行的配平卡、逻辑的行序、对接的偏差与网络的断路线路，都在开始和「再玩一次」时由 `GameController` 的构造参数 `random`（默认 `Math.random`，测试传入固定序列）抽出。抽取保证第一个目标不会被一次无选择的主按钮直接通过，三维场景从游戏的 `view()` 读取当前目标。铁器与印刷没有可随机的目标数据，保持固定。自动演示仍用 `demo()` 走通，但演示过的一局不计成绩。

完成后，面板在原来放操作按钮的位置显示完成卡：本局用时（从第一次操作起，隐藏标签页的时间不算）、操作次数、本工坊最快与最少操作，以及「下一站」（沿 `world.next`）、「再玩一次」和「全部工坊」。智能体、石器、用火和农业四个演示工坊走到最后阶段时显示同样的卡片，没有成绩。差分机的平方数表算到 10² 记为完成，也没有成绩。

进度只存在读者的浏览器里（`apps/web/app/lib/local-state.ts` 的 `eacc-workshops`，按工坊页面路径记录；读写失败时按未完成处理）。`/chronicle/workshops` 列出全部十五座工坊，已完成的显示 ✓ 和最好成绩，加速史「工坊」图层同样标 ✓ 并显示「已完成 n / N」；服务端渲染不带进度，水合后再补。完成、错误状态的呈现，以及复位、暂停、减少动态效果和 iframe 交接，都沿用 `web/shared/page.tsx` 与 `experience.ts` 的公共运行逻辑；场景自身只负责几何、操作点、状态与动画。

十个挑战的装置由代码三维几何构成：泥板与筹码、砌石炉和风箱、木制螺旋印刷机、望远镜、梁式蒸汽机构、灯丝回路、木骨蒙布双翼机、逻辑实验板、对接舱与网络节点台各有独立形制。房间通过 `web/games/workshop.ts` 共用材质、照明、静态合并与实际房间反射：后墙与左墙开有真实窗洞，一束投影的斜阳穿过窗格落在地板和装置上，窗口另有偏冷的天光与地板反弹的暖光；观星工坊保持夜景，同样的窗洞改由月光照入。仅复用既有 1822 CC0 木材、石材、灰泥贴图，没有新增素材或 R2 上传项。时代原画提供取景、材质和光色参照，不铺作图片背景充当三维空间。

各场景「关于这一幕」链接到 Met、大英博物馆、International Printing Museum、Museo Galileo、Science Museum Group、Smithsonian、NPS、Computer History Museum、NASA 或 CERN 的机构资料。代表装置与游戏数值用于解释原理，不是精确历史复刻或真实操作参数；入口年代的含义在对应场景说明。十个挑战的验证记录集中在 [时代小游戏验证记录](evidence/ten-era-games-2026-10/verification.md)，具体检查范围和结果以该记录为准。

## 素材放在 R2

贴图、模型和 HDR 不进 git，也不随新闻站发布：

| 位置 | 内容 |
|---|---|
| `assets/<id>/sources.json` | 每项素材的原始文件名、来源地址或 R2 键、MD5、授权、输出宽度和压缩质量；扫描模型另有原始 GLTF、几何与贴图校验（进 git） |
| `.data/scene-sources/<id>/` | 原始文件（本机，不进 git） |
| R2 桶 `e-acc` 的 `scene-sources/<id>/` | 没有公开来源的原始文件（例如模型生成的图），私有 |
| `apps/web/public/media/scenes/<id>/` | 构建出的 WebP、GLB 与 HDR，本机开发直接由网站提供（不进 git） |
| R2 桶 `e-acc` 的 `scenes/<id>/` | 同样的 WebP、GLB 与 HDR，线上由入口 Worker 在 `/media/scenes/<id>/<文件>` 提供 |
| `web/<id>/manifest.json` | 素材名 → 带内容哈希的文件名，场景代码只从这里取地址（进 git） |

文件名里带内容哈希，所以每个地址的内容永远不变，Worker 给 `immutable` 一年缓存；贴图换了就是新地址。入口 Worker 只读桶里的 `scenes/` 前缀（`deploy/edge/src/scenes.mjs`），`wallpapers/` 和 `scene-sources/` 不会对外。

```bash
node modules/scenes/scripts/assets.ts build difference-engine-1822    # 取原始文件、校验 MD5、生成 WebP 和 manifest.json
node modules/scenes/scripts/assets.ts build stone-tools               # 下载并打包扫描模型、地面材质和环境光
node modules/scenes/scripts/assets.ts build taming-fire              # 树皮与扫描枯枝；农业的木构也复用树皮
node modules/scenes/scripts/assets.ts build agriculture              # 田地、泥墙与茅草材质
node modules/scenes/scripts/assets.ts build agents-2026              # 三组生成的连续全景
node modules/scenes/scripts/assets.ts upload difference-engine-1822   # 把 manifest 里的文件传到 R2（需要已登录的 cf CLI）
```

发布顺序：先 `upload`，确认 `https://e-acc.ai/media/scenes/<id>/<文件>` 能打开，再发布新闻站。旧文件留在桶里，已经缓存的旧页面仍能取到；确认没有页面引用后再删。

## 新增一个场景

1. 在 `scenes.ts` 加一条，在 `web/<id>/` 写 `page.tsx`、`messages.ts`（中文文案为键，`en` 是英文）和场景代码，参照 `difference-engine-1822`。`module.ts` 会按 `scenes.ts` 注册中英文路由。
2. 原画视角要和这个里程碑的插画对齐：隧道停在插画上时，场景以同样的取景（插画 3:2、`object-fit: cover`）开始。
3. 若有新素材，在 `assets/<id>/sources.json` 记下每张贴图的来源和授权，`build` 之后检查 manifest，再 `upload`；只复用现有材质的代码几何挑战无需新增素材清单或上传。

2026 的房间、设备、屏幕与表面细纹由代码生成，木地板和灰泥墙复用 1822 的 CC0 资产。石器、用火和农业共用已准备的岩石扫描；用火另有树皮与枯枝，农业另有田地、泥墙和茅草 PBR。原画继续使用主站已发布的时代插画，不把原画当作三维背景。

本地需要构建 `difference-engine-1822`、`stone-tools`、`taming-fire`、`agriculture`、`agents-2026` 五组素材。发布前依次上传所有新增素材，确认内容哈希地址，再发布支持 GLB/HDR 的入口 Worker 和新闻站。浏览时只请求本站的静态资产，不连接模型或素材供应商。

这些是艺术与原理示意，不是精确遗址复原或真实物理模拟。石器入口采用时间线约 330 万年前的年代，不放入较晚的对称手斧或编织容器。用火起源仍有研究不确定性，不把较晚岩画安放到这个年代。农业把一季压缩为数秒，不把作物驯化表述为一季完成。2026 的任务、灯光和检查结果均为本地预设演示，不表示模型性能或实时遥测。资料链接放在每个场景的“关于这一幕”。

## 石器工坊的素材

扫描素材来自 Poly Haven，均为 [CC0](https://polyhaven.com/license)：[Rock 09](https://polyhaven.com/a/rock_09)、[Boulder 01](https://polyhaven.com/a/boulder_01)、[Grass Bermuda 01](https://polyhaven.com/a/grass_bermuda_01)、[Shrub 01](https://polyhaven.com/a/shrub_01)、[Gravelly Sand](https://polyhaven.com/a/gravelly_sand)、[Kiara 1 Dawn](https://polyhaven.com/a/kiara_1_dawn)。来源与校验在 `assets/stone-tools/sources.json`。`pack-gltf.ts` 保留扫描几何，将贴图嵌入 GLB，并合并原素材独立的植被透明通道。HDR 只用于环境光。

石核与三片石片从同一扫描网格裁切，断面按真实交线封口；阶段切换、更换几何与复位仍由现有交互驱动。地面有独立色彩、法线、粗糙度与高度材质，岩石使用接触阴影，植被实例绘制。素材在浏览器直接从本站加载，不请求 Poly Haven，也不调用模型。这组素材已上传 R2 的 `scenes/stone-tools/`；内容哈希地址由同名场景的 `manifest.json` 记录。

## 2026、用火与农业的细节

2026 采用弧形超宽 OLED 主屏和竖向终端，机架另有内嵌硬件状态屏，替换原来的三块并排普通显示器。主屏上的三个英文工作区仍对应计划、实现和验证，竖屏记录同一预设流程；所有设备内显示的文案固定为英文，外层界面继续按读者语言翻译。`agents-2026/screens.ts` 负责设备内容，`display-geometry.ts` 生成实际弧面，`hardware.ts` 负责设备实体。

工作台使用真实比例的升降桌、关节支架、分体机械键盘、轨迹球、旋钮控制台和外露开发板。机架有独立计算模块、散热片、风扇、刚性冷却管、储液筒与透明侧板，可以从侧面检查。新增输入区视角，点击控制台与显示器都能推进原有任务。布光仍使用主站的暖黑、黄铜和低饱和绿；只在 2026 场景中增加随相机焦点变化的轻微景深，显示器内容保持清晰。

进入 2026 场景直接处于 coding 阶段，代码行高亮和终端光标持续播放；重新开始仍恢复待命，单步和自动演示保留原先的有限四阶段。三扇实体窗框共同呈现同一张连续全景，按真实窗框间距裁切，各窗间的地平线与景物保持连续。任务前进触发整体换景；处于活动阶段时每 10 秒同步轮换富士山、巴黎和长城，使用 1.4 秒淡变。重置恢复富士山并停轮换；减少动效时仅手动换景并立即完成。隐藏页面、说明弹窗和离开 iframe 时场景时钟停止。

可见台灯承担桌面的暖色主光与投影，各窗从当前图像局部线性色彩生成补光，随画面平滑过渡。窗景切换完成后捕获实际房间，更新金属、玻璃与木桌的环境反射，释放上一张反射纹理；不在每帧重新捕获。木材高度图与颜色图分离，设备分别使用哑面石墨、拉丝铝与铜件材质。代码 Canvas 仅在内容变化的 2 Hz 节点重绘。

设备与显示器内容由代码生成；窗内全景使用内置 imagegen 生成，完整提示词在 [window-scenes.prompt.md](assets/agents-2026/window-scenes.prompt.md)，原始生成图的来源、尺寸和 MD5 在同目录 `generated-sources.json`，不归入 CC0 扫描素材。图像只是虚拟窗的显示内容，工坊与设备仍为可环视的三维几何。木地板与灰泥继续复用已有 CC0 素材。任务、指示灯、风扇与状态屏均是本地预设演示，不接真实智能体或系统监控。

三张全景采用壁纸同款 `realesrgan-x4plus` 本地 4 倍超分，再等比缩至 3840×1280，保留完整 3:1 画面。构建源与原始生成图分别保存在私有 `scene-sources/agents-2026/` 的不同对象中；`sources.json` 指向高清构建源，原图仍按 `generated-sources.json` 的键恢复。处理配方、原图与产物校验记录在 [scene-art-upscale-2026-10-28.json](assets/scene-art-upscale-2026-10-28.json)。发布时先归档新增 PNG 并上传内容哈希 WebP，再发布网页；旧对象保留供旧版页面读取。

用火用真实扫描岩石构成岩棚，木柴由带树皮、年轮和弯曲轮廓的实体几何构成；火焰是局部体积内的程序化光线步进，烟与火星另行绘制。原有燃料阶段驱动木柴、火焰和投影强度。

农业保留农时阶段，增加可见门洞、分层茅草、编织围栏与器皿、陶器内壁、谷粒和收割束。麦秆、弯曲叶片、成对谷粒和芒组成两个实例化网格，阶段推进仍控制生长与收获；收获后切换到独立的留茬网格，避免把宽叶片压扁在地上。不把一季演示等同于作物驯化。

新增素材均来自 Poly Haven [CC0](https://polyhaven.com/license)：[Bark Brown 02](https://polyhaven.com/a/bark_brown_02)、[Dry Branches Medium 01](https://polyhaven.com/a/dry_branches_medium_01)、[Clay Plaster](https://polyhaven.com/a/clay_plaster)、[Reed Roof 03](https://polyhaven.com/a/reed_roof_03)、[Dry Mud Field 001](https://polyhaven.com/a/dry_mud_field_001)。逐项来源与校验记录在 `assets/taming-fire/sources.json`、`assets/agriculture/sources.json`。

## 1822 差分机工坊的素材

扫描材质来自 [Poly Haven](https://polyhaven.com/)，授权 [CC0](https://polyhaven.com/license)：木地板、木机架和工作台用 [Old Wooden Floor 03](https://polyhaven.com/a/old_wooden_floor_03)，拱窗和石材用 [Old Stone Wall](https://polyhaven.com/a/old_stone_wall)，灰泥墙用 [Plastered Wall 03](https://polyhaven.com/a/plastered_wall_03)。黄铜、铸铁和钢材的细纹由 `materials.ts` 在浏览器里生成。

`engineering-plate` 是模型生成的装饰性工程蚀刻图，提示词在 `assets/difference-engine-1822/engineering-plate.prompt.txt`，原图在 R2 的 `scene-sources/`。现有高清构建源采用相同 4 倍超分流程后等比缩至 2880×3840，来源与校验同见上述处理记录。它只用于房间里的纸张和图板，不是历史机构图。

场景是艺术概念复原：1822 年是巴贝奇提出差分机的年份，完整的工坊和机器不代表当年已有的实物。演示的平方数表用有限差分计算（`calculation.ts`），机械动画只示意原理。

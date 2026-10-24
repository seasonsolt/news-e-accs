# 1822 · 差分机工坊

本地独立三维原型，用于验收单景的空间、美术方向和交互。没有接入生产路由，也没有修改时间线数据。

## 运行

在仓库根目录运行：

```sh
python3 tools/prototypes/difference-engine-1822/preview.py
```

打开 <http://127.0.0.1:8842/>。通过 HTTP 加载 ES modules；不要直接双击 HTML。所有运行资源都在本目录内，不依赖 CDN、后端、数据库、登录或模型请求。

## 试玩

- 拖动环视，滚轮走近；触屏单指环视、双指缩放和平移。
- WASD 或方向键在地面方向行走，房间外沿和机器主体阻挡行走。
- 「全景 / 走近 / 侧看」切换预设镜头；拖动时立即接管镜头。
- 点击三维手柄、数轮或纸张，也可点击相应标记。
- 「转动一轮」或空格键计算下一项；「连续运转」重复计算；「复位数表」重置。
- 手机默认收起原理面板，可以点击「＋」展开；查看原画和说明使用原生 dialog。
- `prefers-reduced-motion` 下取消镜头飞行、尘埃漂移和连续机械动画，计算用离散步骤展示。

## 原型边界

场景是独立三维几何，包括机架、数轮、传动轮、手柄、工作台、工坊、拱窗和窗外轮廓。原画仅用于美术参照与对照查看，没有贴成房间背景。

数学演示从 A = 0、B = 1、C = 2 开始，每轮依次执行 A ← A + B、B ← B + C，得到平方数 0、1、4、9……。最左三根计算柱表示 A/B/C，前五层数轮从下到上为个、十、百、千、万位；另外三根柱为高阶差分的展示，值保持为零。三维纸张、面板和数轮在每轮结束后保持一致。演示上限为 99 轮。

齿轮、拨杆和传动动画用于说明，未复刻历史机械的全部齿比、进位联动或机构；没有刚体物理模拟。1822 年对应差分机的提出，场景不是当年实物或工坊的考古复刻。历史边界参考[科学博物馆技术说明](https://www.sciencemuseum.org.uk/sites/default/files/2023-09/DE2_Technical_Description.pdf)。

美术参考来自本站 `apps/web/public/media/art/moments/difference-engine-1600.webp`，复制为本目录 `reference.webp`。

第二版将每根计算柱由 10 层细化到 18 层，并增加 6 根后方进位轴。机架和轴承有真实倒角；黄铜有旋切细纹、氧化斑和变化的粗糙度；数轮、计算规则和操作点沿用第一版。工作台补上台钳、螺纹杆、工具、油壶、油灯、书籍、工程图与垂布。

木地板、灰泥墙和窗框石材使用 Poly Haven 的 CC0 扫描贴图，分别加载颜色、OpenGL 法线、粗糙度与遮蔽。日光从高窗外照入，配合 GTAO 接触阴影、抗锯齿和暖色调色。工程图由内置 image_gen 生成，资产、完整提示词和来源记录见 [`assets/README.md`](assets/README.md)。它是场景装饰，不是历史文献。

## 原画画风

默认按原画的铜版画风格渲染（`rendering.js` 的 `ENGRAVING`，在 OutputPass 之后处理显示颜色）：
- 亮度对齐原画：启动时在「原画视角」测一次渲染画面的亮度均值和离散度，映射到 `reference.webp` 的数值；只测一次，走动时画面不会忽明忽暗。
- 着色：其余部分转为褐色墨与纸色，只有黄铜保留色相。
- 线条：中间调和暗部加手刻排线（黄铜上不加），再加墨线轮廓和纸纹。

页脚「画风」可切换写实渲染，`?style=pbr` 默认打开写实渲染。

「原画视角」（`views.painting`）按原画构图对齐，3:2 下垂直视场角为 46°，其他比例按 `object-fit: cover` 换算。时间隧道（`../chronicle-tunnel/`）以 `?embed` 打开本场景，从这个视角交接。

## 实现与验证

- `scene.js`：三维几何、光照、镜头、拾取、机械演示和界面绑定。
- `materials.js`：扫描材质、金属磨损和纹理加载。
- `rendering.js`：GTAO、抗锯齿和颜色输出；玻璃与光束不参与遮蔽。
- `preview.py`：仅绑定本机的静态预览；连接队列支持同时请求模块和材质。
- `calculation.js`：有限差分寄存器、十进制数轮与行走边界。
- `index.html` / `style.css`：界面和响应式布局。
- `vendor/`：固定 Three.js **0.180.0**，来自 npm 官方 `three` 包，保留 MIT LICENSE。无新增 npm 工作区依赖。
- 静态几何按材质合并；重复数轮使用 instancing；像素比受限，隐藏页面暂停渲染与连续计算。

```sh
node --test tools/prototypes/difference-engine-1822/calculation.test.js
node --check tools/prototypes/difference-engine-1822/scene.js
node --check tools/prototypes/difference-engine-1822/materials.js
node --check tools/prototypes/difference-engine-1822/rendering.js
```

`evidence/` 保存实际浏览器截图和[精修验收记录](evidence/verification-v2.md)，包含检查结果与提交基线。原型验收与生产发布分别进行。

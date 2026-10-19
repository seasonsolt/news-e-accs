# 四维视角首屏 · 景深视差

> 状态：**刚性分层视差、跃迁转场、相邻版画预取都已实现**。时代版画（`epochs/`）和里程碑版画（`moments/`）都有深度图。
>
> 实现与下文设计的出入：`DepthLayer` 渲染一个 `<div class="observatory-depth">`，在里面自己建 canvas（卸载时 `loseContext` 释放上下文，StrictMode 下同一块 canvas 不能再用），换版画时不重新挂载；视差不用 §3.3 的定点迭代（迭代在深度陡变处不收敛，边缘会被拉弯，像水波），也不把深度切成几层整体平移（一个表面跨过分层线时会被撕成两截），而是沿视线从近到远逐步搜索，停在遇到的第一个表面，再在最后两步之间线性细化：每一点按自己的深度移动，表面不断开，边缘由近处的表面盖住远处；着色器用 `highp`（`mediump` 在 Apple GPU 上是半精度，画面会一格一格地跳）；指针平滑按时间计算，不随刷新率变。转场和预取见 §5。

## 0. 目标

`/chronicle` 首屏（观测舱 `Observatory`）现在是一张静态时代版画，加上 CSS 缓慢推镜（`plate-drift`）。目标是把它做成 **2.5D 景深视差**：给每张版画配一张深度图，用 WebGL 按指针位置让近景和远景错开移动，画面就像一个能往里看的窗口。

这一阶段只做**原型**：先挑两三个风格差异大的时代验证效果，再由用户决定要不要铺开、要不要做切换时代时的「穿越」转场（见 §5）。

非目标：不重做整页 3D；不动指标、里程碑列表、能力清单这些 DOM 内容（可读性、SEO、引用都靠它们）。

## 1. 硬性规则

- 遵守 `AGENTS.md` 和 `docs/plans/time-machine.md` §1，尤其是：
  - 所有动效都要尊重 `useMotionAllowed()`（`apps/web/app/features/motion/preferences.ts`）和 `prefers-reduced-motion`。
  - 服务端渲染出来的必须是最终状态：SSR 和不允许动效时，输出就是现在的 `<Plate>` 静态图，一个像素都不变。
  - 读者打开页面不触发模型调用。深度图是**离线**生成的静态文件，不是运行时推理。
- 不新增前端依赖（不引入 three.js）。原生 WebGL 一个着色器就够。

## 2. 已完成的部分

### 2.1 深度图生成脚本：`tools/make-depth.py`

- 用 `uv run tools/make-depth.py [SRC_DIR] [--force]` 运行。脚本头部是 PEP 723 内联依赖（torch、transformers、pillow、numpy），`uv` 会建临时环境，不往全局装东西。
- 模型：Depth Anything V2 **Small**（`depth-anything/Depth-Anything-V2-Small-hf`）。**只用 Small**：它是 Apache-2.0；Base 和 Large 是 CC-BY-NC，不能用在商业站上。
- 读 `SRC_DIR` 里每个 `<slug>-1600.webp`，在旁边写 `<slug>-depth.webp`：宽 800、**白 = 近**，按 2%–98% 分位数归一化，再做 2px 高斯模糊（让视差把边缘拉弯，而不是撕开）。已有的图默认跳过，`--force` 重算。
- 风格跟 `tools/make-art.sh`、`tools/make-media.sh` 对齐：顶部注释写用法和输出位置。用法写在 `docs/art-prompts.md`（画完版画、跑完 `make-art.sh` 之后）。

### 2.2 深度图：`apps/web/public/media/art/{epochs,moments}/*-depth.webp`

- 50 个时代每个一张，尺寸 800×534，合计约 384KB（每张 3–4KB）。
- 编码：保存成了 RGB 的 WebP（三通道相同），着色器只读 `.r`，不影响使用。
- `moments/`（里程碑自己的版画）现在也都有了（82 张，约 628KB）；新增里程碑版画后要补跑 `uv run tools/make-depth.py apps/web/public/media/art/moments`。没有深度图的版画按平深度画：没有视差，转场照常。

### 2.3 前端

`apps/web/app/features/chrono/DepthLayer.tsx`，按 §3 实现（出入见文首）。

## 3. 前端设计

### 3.1 接入点

- `apps/web/app/features/chrono/Observatory.tsx`：它已经算出了 `plate = { key, src, alt }`（`src` 形如 `/media/art/epochs/agents`，不带宽度后缀），并渲染 `<Plate key={plate.key} src={plate.src} alt={plate.alt} className="observatory-plate" />`。
- 在 `<Plate>` 后面加一个兄弟节点：`<DepthLayer key={plate.key} src={plate.src} />`，渲染一个 `<canvas className="observatory-depth" aria-hidden="true">`。新组件放在 `features/chrono/DepthLayer.tsx`。
- `key` 跟着 `plate.key` 走，切换时代或里程碑时组件重新挂载、重新加载两张纹理，这样最简单。
- `<Plate>` 本身（`components/shell/Deck.tsx`）**不改**：它是 SSR 输出，也是一切失败时的回退。

### 3.2 什么时候启用

同时满足这几条才创建 WebGL：

1. `useMotionAllowed()` 为 true。服务端快照是 false，所以 SSR 和 hydration 时都不会渲染 canvas。
2. 能拿到 `webgl` 上下文。
3. `${src}-1600.webp` 和 `${src}-depth.webp` 两张图都加载成功。

任何一步失败，就不渲染 canvas（或保持 `opacity: 0`），页面就是现在的样子。都成功以后，canvas 在约 400ms 内淡入，盖在 `<img>` 上面。canvas 的 `pointer-events: none`。

### 3.3 着色器（WebGL1，一个全屏三角形或矩形）

```glsl
uniform sampler2D uImg, uDepth;
uniform vec2 uPointer;   // -1..1，已平滑
uniform vec4 uCover;     // xy = 采样区域大小，zw = 偏移（模拟 object-fit: cover + object-position）
uniform float uStrength; // 约 0.02（画面宽度的 2%）
uniform float uFocus;    // 约 0.5：这个深度的地方不动，更近的往一边走、更远的往另一边走
varying vec2 vUv;
void main() {
  vec2 uv = uCover.zw + vUv * uCover.xy;
  vec2 p = uv;
  for (int i = 0; i < 4; i++) {          // 迭代几次，近似遮挡关系，比单次偏移少撕裂
    float d = texture2D(uDepth, p).r;
    p = uv + uPointer * uStrength * (d - uFocus);
  }
  gl_FragColor = texture2D(uImg, p);
}
```

- **cover 映射**：在 JS 里根据 canvas 宽高比和图片宽高比算采样区域。`.observatory-plate` 用的是 `object-fit: cover; object-position: 50% 38%`，canvas 要对齐它，否则淡入时画面会跳。纹理开了 `UNPACK_FLIP_Y` 时，y 方向的偏移是 `(1 - sy) * (1 - 0.38)`。
- **留边**：采样区域再缩小约 4%（相当于放大 1.04 倍），视差移动时不会露出图片边缘。现有 CSS 的 `plate-drift` 本来就会放大到 1.06，所以淡入时的差别不明显。canvas 启用后把 `<img>` 的 `plate-drift` 动画停掉，免得两层错位。
- 纹理用 `LINEAR` 过滤、`CLAMP_TO_EDGE`。图片不是 2 的幂，WebGL1 下不能生成 mipmap。

### 3.4 输入

- **精细指针**（`hasFinePointer()`，同样在 `features/motion/preferences.ts`）：监听 `.observatory` 整个 section 的 `pointermove`，换算成 -1..1，用指数平滑（每帧 `cur += (target - cur) * 0.08`）。`pointerleave` 时目标回到 0。
- **触屏或粗指针**：不读陀螺仪（需要权限弹窗，原型阶段不值得），改成很慢的李萨如漂移，幅度是指针模式的一半。
- 可以叠一个很轻的随深度变化的推镜（近处比远处放大得快一点），替代 `plate-drift`。原型阶段可选。

### 3.5 性能和生命周期

- 只渲染这一块区域，像素比上限 1.5。
- `IntersectionObserver` 观察：观测舱滚出视口就停 rAF。
- 指针静止、平滑值也已经收敛时，可以停止渲染、只在下一次 `pointermove` 时恢复。可选，原型先不做。
- 处理 `webglcontextlost`：直接卸掉 canvas，回退成静态图。
- 卸载时删掉纹理、program、buffer，取消 rAF，断开 observer 和监听器。

### 3.6 样式（`apps/web/app/app.css`，靠近 `.observatory-plate`，约第 1084 行）

```css
.observatory-depth { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity 400ms var(--ease-out-quart); }
.observatory-depth.is-ready { opacity: 1; }
```

它在 DOM 里排在 `<img>` 后面，所以在同样的 `z-index` 下会盖住图片。`.is-forecast` 给 `<img>` 加的 `filter: saturate(.72) brightness(.92)` 也要同样加到 canvas 上，否则「推测」时代的观感会变。

## 4. 验证

- 跑 `AGENTS.md` 里列的检查：`npm run typecheck`，`npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts`。chronicle 相关的测试是 `apps/web/tests/chrono.test.ts` 和 `chrono-ssr.test.ts`，**必须确认 SSR 输出没有变**（不出现 canvas）。
- 本机用 `.claude/launch.json` 里的 `web` 和 `api` 配置起站点，打开 `/chronicle`，至少看这三张：`big-bang`（几乎没有前景，视差应该很弱，不能出现明显畸变）、`steam-age`、`agents`。
- 手动检查以下几种情况都回退成静态图：系统开了「减少动态效果」、站内动效设成 reduced、深度图 404（例如任意一个 moment）、WebGL 不可用。
- 切换时代（键盘方向键、拖时间轴）时不能闪白，也不能泄漏 WebGL 上下文：连续切换 20 次以上，看 DevTools 里有没有出现 “Too many active WebGL contexts” 警告。

## 5. 跃迁转场与预取（已实现）

- 换版画是一次跃迁：当前画面（A）沿着从消失点出发的射线拉出光束、越来越快（三次方加速），在中点一道暖色闪光（不到全白，免得刺眼）盖住硬切，下一张（B）拖着光束出现、减速落定。往回翻时间时整段倒放。`uWarp` 0 只有 A，1 只有 B，线性推进 900ms。
- 试过、放弃了的做法：按深度和颗粒噪声让画面碎开溶解。观感是“水波纹、镜花水月”，和 e/acc 要的推力、速度、硬光不符。
- 深度图最多等 150ms，晚到的到了再补上：缺失的深度图会返回一张 404 页面，线上要 1.5–2 秒，不能挡住转场。
- 路由用 `nearbyPlates`（`features/chrono/format.ts`，和方向键的 `stepPicture` 同一套规则）算出前后各一张，`DepthLayer` 在当前版画加载 400ms 后预取并解码它们，最多缓存 6 张。只在动效开着时预取；静态版画不受影响。
- 连续快速翻页时只采用最后一次请求；正在跃迁的那一段直接落地，再从落地的画面起跳。

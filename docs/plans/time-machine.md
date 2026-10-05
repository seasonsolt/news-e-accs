# 实施文档：四维视角 · 全站时光机

> 交给实施 agent（pi + gpt-6.1-sol）。规划和内容（数据、配图）由 Claude 负责；**代码实现由你负责**。
> 先通读本文档、`AGENTS.md`、`docs/architecture.md`，再动手。不明白的地方停下来问，不要猜。

## 0. 目标

给这个 e/acc 资讯站加一个"四维生物视角"，分两部分：

1. **全站时光机**：任何页面的地址带上 `?at=YYYY-MM-DD`（北京时间的日期），精选流、热点榜、模型榜、日报就显示**那一天结束时**的样子。
2. **`/chronicle` 四维视角页**：一条对数时间轴，从大爆炸（-138 亿年）经过"现在"延伸到 100 年后（这一段是预测，用虚线表示）。拖到任意时刻，页面显示当时的：
   - 时代版画
   - 文明仪表：人口、能源功率、卡尔达肖夫指数、每美元算力、跨洋通信延迟、最快移动速度
   - 已经掌握的能力和尚未出现的能力
   - 那附近的里程碑
   - 如果那一天在本站的记录范围内，再给出"这一天在本站"的入口

核心概念：时间轴的刻度取的是到现在的距离的对数（symlog）。10 天、1 年、100 年、1 万年、1 亿年，每个数量级占同样的宽度，所以越靠近现在，事件越密集。**这个密度本身就是"加速"的可视化**。

## 1. 硬性规则（违反即返工）

- 遵守 `AGENTS.md` 的全部规则，尤其是：
  - 前端只通过 HTTP 读 `apps/api`。
  - 公开数据只从 `packages/backend/src/publication/` 读。
  - 打开页面不触发模型调用。
  - 公开页面不读也不写 cookie（`tests/cache.test.ts:98`）。
  - 迁移只能做增量。本功能**不需要**新迁移。
- **不要 commit，不要 push。** 做完后由用户审阅。
- **工作区里有别人正在进行的动效改动，不是你的，不要回滚，不要格式化，不要改动其中与本功能无关的部分。** 涉及的文件有：
  - `app.css`（约 809 行之后的新样式）
  - `features/motion/*`
  - `features/onboarding/Onboarding.tsx`
  - `lib/local-state.ts`
  - `apps/web/tests/motion*.ts`
  - `routes/hot.tsx` 和 `root.tsx` 里的动效部分

  你需要改这些文件时，只做本功能需要的最小改动。
- 不要创建或修改 `industry/chronicle/*.json`（数据由 Claude 在起草），也不要修改 `docs/art-prompts.md`（提示词由 Claude 写）。
- 风格要匹配周围代码：注释密度、命名、Tailwind 写法、英文注释、中文文案。只定义真正用到的抽象。
- 所有动效都要尊重 `useMotionAllowed()`（`features/motion/preferences.ts`）和 `prefers-reduced-motion`。服务端渲染出来的必须是最终状态。

## 2. 已完成的部分（Claude 已写，类型检查已通过）

你要做的：先通读这些代码，再按 §5 补测试。发现 bug 就修，不要整体重写。

### 共享层：`packages/contracts`

- **`src/time.ts`**：新增 `beijingDayEnd(date)`，返回那一天北京时间 23:59:59.999 对应的时刻。
- **`src/site.ts`**：`TimelineFilters` 新增 `at?: string | null`。
- **`src/chronicle.ts`**（新文件）：
  - 类型：`ChronicleEra`、`ChronicleMilestone`、`ChronicleMetric`、`ChronicleResponse`、`TimeMachineBounds`。
  - 纯函数：`decimalYear`、`dateToYear`、`yearToDate`、`toAxis`、`fromAxis`、`axisTicks`、`timeLabel`、`interpolateMetric`（两点之间按对数插值）、`kardashev`、`eraAt`、`capabilitiesAt`。
  - 常量：`BIG_BANG`、`AXIS_FUTURE_YEARS`、`AXIS_LINEAR_YEARS`。

### 后端：`packages/backend`

- **`events/hot-read.ts`**：
  - 新增 `hotRankingAt(at)`，取 `at` 之前最后一次已发布的热点榜计算结果。
  - `rankingExtras(ranking, keep)` 和 `loadHotStrip(at?)`：读历史榜时不覆盖"当前榜"的进程内缓存。
- **`events/hot.ts`**：保留规则改为 `pruneHotRankings(now)`。
  - 30 天内的记录全部保留。
  - 30 天以前的，**每个北京日只留当天最后一条已发布的**。
- **`publication/stories.ts`**：`loadHot(asOf?)`。
- **`publication/timeline.ts`**：
  - `TimelineQuery.at`（从 `TimelineFilters` 继承）设置后，`now` 变为那一天的最后时刻。
  - 这时不走缓存，`refreshAt` 为 null。
  - 分页游标的绑定里加入了 `d: at`。没有 `at` 时绑定哈希和原来一致，旧游标仍然可用。
  - 返回的 `filters` 里带上 `at`。
- **`publication/reports.ts`**：`reportKeyAt(kind, date)` 返回不晚于该日的最新一期报告的 key（日报、周报、月报都适用）。
- **`publication/chronicle.ts`**（新文件）：
  - `loadChronicle()`：读取 `industry/chronicle/{eras,milestones,metrics}.json`。目录可以用环境变量 `AIHOT_CHRONICLE_DIR` 覆盖，结果在进程内缓存。
  - `timeMachineBounds()`：给出精选流、热点榜、模型榜、日报各自最早的日期和其中最早的一个（`earliest`）。查询结果缓存 10 分钟，`today` 每次请求实时计算。
- **`leaderboard/read.ts`**：
  - `runView(asOf?)`：读历史时取 `generated_at <= asOf` 的最后一次运行。历史运行按 id 缓存，最多 8 个，不影响当前运行的缓存。
  - `loadBoard(key, asOf?)`、`loadModel(slug, asOf?)`。
  - `invalidateLeaderboard()` 会同时清空历史缓存。

### API：`apps/api/src/routes`

- **`site.ts`**：
  - `parseAt(raw)`：
    - 功能开关关闭、参数为空、或日期就是今天 → 返回 null。
    - 日期格式不对或在未来 → 400。
  - `PAST_SLICE_CACHE`：历史切片的缓存策略，max-age 3600，s-maxage 86400。
  - `/api/site/timeline` 和 `/api/site/hot` 接受 `at` 参数。
  - 新增三个接口：
    - `GET /api/site/chronicle`
    - `GET /api/site/chronicle/bounds`
    - `GET /api/site/reports/:kind/at/:date` → `{ key }`
- **`leaderboard.ts`**：
  - `boards/:key` 和 `models/:slug` 接受 `at` 参数。
  - 带 `at` 时如果那天还没有任何排名运行，返回 404（不是 503）。

### Web：`apps/web/app`

- **`features/chrono/at.ts`**：
  - 读取：`parseAt`、`requestAt`、`useAt`。
  - 判断：`followsTime(pathname)`，即这个页面会不会随时间变化。
  - 生成：`withAt(to, at)`、`stepAt`、`atLabel`。
- **`features/chrono/TimeMachine.tsx`**：
  - `TimeDial`：侧栏底部的黄铜拨盘，有前一天、后一天按钮和原生日期选择器，日期用 `SplitFlapText` 翻牌显示。
  - `TimeBar`：设定了 `at` 时显示在页面顶部的吸顶条，提供前一天、后一天、四维视角和回到现在。
  - `chronicleHref(at)`。
- **`features/chrono/format.ts`**：`scientific`、`chineseCount`、`duration`、`metricValue`、`timeParam`、`distanceLabel`。
- **`features/chrono/ChronicleAxis.tsx`**：
  - 对数时间轴组件，鼠标拖拽、点击、横向滚轮、方向键都能移动指针。
  - 点击时吸附到 8px 内最近的里程碑。
  - 无障碍角色是 `role="slider"`。
- **外壳：**
  - `root.tsx`：根 loader 并行读取 `/api/site/meta` 和 `/api/site/chronicle/bounds`，返回 `timeBounds`；`SiteShell` 里放了 `TimeBar`。
  - `Sidebar.tsx`：放了 `TimeDial`；`SideLink` 和 `MobileTabBar.tsx` 的链接都会保留 `at`。
  - `nav.ts`：
    - "内容"区新增"四维视角 → `/chronicle`"。
    - 功能开启时隐藏原来的"加速时间线"外链（`/timeline`）。
    - `/chronicle` 加入 `MORE_PATHS`。
  - `more.tsx`：新增"四维视角"入口，"偏好"组里放了 `TimeDial`。
  - `icons.tsx`：新增 `IconHourglass`。
- **路由：**
  - `home.tsx`：读取 `at` 并传给接口；带 `at` 时不显示 onboarding 弹层，页面设为 `noindex`。
  - `hot.tsx`：读取 `at`；文案改为"截至 X，过去 48 小时"；没有存档时显示专门的空状态；带 `at` 时 `noindex`。
  - `leaderboard.tsx`：loader 返回 `{ at, board }`。`board` 为 null 时显示"这一天还没有模型榜"。原来的页面主体拆成了 `Board` 组件。
  - `leaderboard-model.tsx`：读取 `at`，带 `at` 时 `noindex`。
  - `report-latest.tsx`：带 `at` 时调用 `/reports/:kind/at/:date`，有结果就重定向到 `/:kind/:key?at=`，没有就显示空状态。
  - `BoardTabs.tsx`：切换榜单时保留 `at`。
  - `Timeline.tsx`：`filterQuery` 带上 `at`。
- **`industry/features.ts`**：新增开关 `FEATURES.timeMachine = true`。

### 已知需要你收尾的小问题

0. **`interpolateMetric` 在最后一个数据点之后会一直返回最后的值。** 结果是 2040 年的能耗显示成 2025 年的数，看上去像一个事实。请改成：
   - 在现在之前（`t ≤ now`），晚于最后一个点时仍然返回最后一个点的值。
   - 在现在之后，只有该指标有预测点（`forecastFrom`）并且 `t` 落在数据点范围内时才返回值，其余一律返回 `null`。

   为此要给函数加一个 `now` 参数，同步修改 §5 里对应的测试。

1. **`routes/leaderboard.tsx` 的 loader 在 catch 分支里又请求了一次接口**，借 `loadOr404<never>` 把错误转成响应。这是权宜写法。请在 `lib/api.server.ts` 里把错误映射提取成 `apiErrorResponse(error, opts)`，让 `loadOr404` 和这里共用，只请求一次。
2. **`features/feed/HotTopics.tsx` 里指向 `/hot` 的链接没有保留 `at`**。用 `useAt` 和 `withAt` 补上。
3. **`TimeBar` 的样式类 `.time-bar`，以及 `.time-dial`、`.time-dial-face`，都还没有 CSS**，见 §3.2。

## 3. 待实现

### 3.1 `/chronicle` 页面

**注册路由：** 在 `apps/web/app/routes.ts` 里加 `route("chronicle", "routes/chronicle.tsx")`，放在 `about` 之前。

**新建 `routes/chronicle.tsx`：**

**`loader`**
1. 功能开关关闭时：`throw data({ message: "not_found" }, { status: 404 })`。
2. `now = decimalYear(Date.now())`。这个值在服务端算好后放进 loaderData，客户端一律用它，保证水合时前后一致。
3. 读 `t` 参数：
   - 用 `Number()` 解析，结果不是有限数时取 `now`。
   - 截断到 `[BIG_BANG, now + AXIS_FUTURE_YEARS]` 之间。
4. 用 `loadOr404<ChronicleResponse>("/api/site/chronicle")` 读数据。
5. 返回 `{ chronicle, now, t }`。

**`shouldRevalidate`**：路径名没变（只是 `?t=` 变了）就返回 `false`；其他情况用 `defaultShouldRevalidate`。

**`meta`**：调用 `pageMeta`，参数如下：

| 字段 | 值 |
|---|---|
| `title` | `"四维视角"` |
| `description` | `"从大爆炸到此刻，再到公开的预测：拖动时间轴，看人类在每个时刻掌握了什么。"` |
| `path` | `"/chronicle"`（canonical 不带 `t`） |
| `image` | `"/og/pages/chronicle.png"` |

**`headers`**：`public, max-age=0, s-maxage=3600, stale-while-revalidate=600`。

**组件状态**
- `const [t, setT] = useState(loaderData.t)`。
- 拖动过程中调用 `setT`；松手（commit）时调用 `setT`，再 `navigate(`?t=${timeParam(t, now)}`, { replace: true, preventScrollReset: true })`。
- 浏览器前进或后退：在 `useEffect` 里监听 `location.search` 变化，解析出 `t` 后 `setT`。

**页面结构（自上而下）**

1. **页头**
   - 小字：`四维视角`，用 mono 字体和 accent 色。
   - h1：`timeLabel(t, now)`，用 `font-display` 字体，桌面端 44–52px，手机端 34px。
   - 副标题：`{era.title} · {distanceLabel(t, now)}`。如果 `era.forecast` 为真，加一个 Badge"推测"。

2. **观察窗**（`.chronicle-window`）
   - 外框是黄铜，固定不变，代表观察者的仪器。窗里的版画随时代切换，**每个时代用自己时代的画风**，这是本页的核心视觉。
   - 图片：
     - `<img src="/media/art/epochs/{era.art}-1600.webp" srcSet="…-800.webp 800w, …-1600.webp 1600w" sizes="(min-width: 961px) 1100px, 100vw" alt="{era.title}（{era.artStyle}）">`
     - 宽高比 3:2，`object-fit: cover`。
   - 图片还不存在的处理（配图在 Phase 4 才画）：
     - 用 `onError` 记录图片坏了。
     - 挂载时也要检查一次：`img.complete && img.naturalWidth === 0`，因为 SSR 期间触发的 error 事件会漏掉。
     - 图片坏了就显示羊皮纸渐变背景，中间放一个大号的 era 标题。
   - 图注：`画风：{era.artStyle}`，放在左下角。
   - 时代摘要：`era.summary`，在图片底部叠一层渐变遮罩来承载。
   - 预测时代：外框换成虚线，图片降低一点饱和度。
   - 用 `key={era.id}` 包住，换时代时重新播放淡入。淡入只用 CSS 实现，开启减少动效时关闭。

3. **时间轴**：`<ChronicleAxis eras milestones now t onMove={setT} onCommit={commit} />`。
   - 下面放一行按钮：`‹ 上一个里程碑`、`下一个里程碑 ›`、`回到现在`。上一个和下一个按 `m.t` 与 `t` 比较，阈值 `1e-6`。

4. **文明仪表**：网格布局，手机 2 列，`lg` 断点 3 列。
   - 每条指标一张卡片，取值用 `interpolateMetric(points, t)`。
   - 卡片内容：
     - 标签
     - 数值：`metricValue()`，用 `num` 或 `mono` 类，22px
     - 单位
     - 一个"来源"小链接：`target="_blank" rel="noopener noreferrer"`
     - `title` 属性放 `metric.note`
   - 取值为 `null` 时，数值显示 `—`，下面写"尚无可靠数据"。
   - `metric.forecastFrom` 存在且 `t > forecastFrom` 时，卡片加"推测"标记，边框改成虚线。
   - 另加一张"卡尔达肖夫指数"卡：用 energy 指标插值出来的值算 `kardashev(watts)`，保留 3 位小数。卡片下方画一条 0 到 1 的黄铜进度条，旁边小字"I 型文明 = 1"。

5. **已经掌握 / 尚未出现**：两栏，用 `capabilitiesAt(milestones, t)` 计算。
   - 已经掌握：最近的 16 项倒序显示成 chip，并写"共 N 项"。每个 chip 点击后跳到该里程碑：commit 到 `m.t`。
   - 尚未出现：接下来的 6 项，每项写"{distanceLabel(m.t, t) 改写成『N 年后』}"。在 `format.ts` 里加一个函数 `untilLabel(from, to)`，输出"N 年后出现"，单位规则沿用 `distanceLabel`。

6. **此刻附近**：按轴上的距离 `|toAxis(m.t) − toAxis(t)|` 取最近的 8 条里程碑，再按 `t` 排序。
   - 每条显示：
     - 时间：`timeLabel(m.t, now, m.precision, m.date)`
     - 类别 Badge
     - 标题（点击后 commit 到 `m.t`）
     - 详情
     - "来源"链接
   - 预测类里程碑：虚线边框，加一行"预测 · {forecast.by}"，链接到 `forecast.url`。
   - 类别的中文名：

     | key | 中文 |
     |---|---|
     | cosmos | 宇宙 |
     | life | 生命 |
     | human | 人类 |
     | energy | 能源 |
     | compute | 计算 |
     | ai | 智能 |
     | culture | 文化 |

7. **这一天在本站**
   - 计算：
     - `date = yearToDate(t)`
     - `bounds = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds`
   - 当 `date` 满足 `bounds.earliest ≤ date < bounds.today` 时，显示一张卡片"这一天在本站"，链接有：
     - `/?at=` 精选
     - `/hot?at=` 热点榜
     - `/leaderboard?at=` 模型榜，仅当 `FEATURES.leaderboard` 开启
     - `/daily?at=` 日报
   - 当 `date ≥ today` 时，标题改成"此刻的本站"，链接指向各个当前页面。
   - 其他情况不显示这张卡片。

8. **时代索引**：`<nav aria-label="时代">`。每个时代一个 `<Link to={`?t=${timeParam(era.from + 1e-9, now)}`} preventScrollReset>`，当前时代高亮。这一组链接在没有 JS 时也能用，是兜底导航。

9. **页脚说明**（小字）：数据在 `industry/chronicle/`，每条都附出处；指标在两个有来源的数据点之间按对数插值；预测来自公开机构或社区，不代表本站观点。

**放置位置**：页面可以复用的组件放进 `features/chrono/`，比如 `ObservationWindow.tsx`、`CivilizationGauges.tsx`、`MomentList.tsx`。路由文件只负责组装。

**响应式**：手机宽度 375px 时不能出现横向滚动；时间轴刻度标签在手机上隔一个显示一个（`ChronicleAxis` 已经处理）。

### 3.2 CSS（追加在 `apps/web/app/app.css` 末尾，新开一个区块，写上注释标题）

只用已有的变量：`--bg`、`--bg-sunk`、`--bg-muted`、`--surface`、`--line`、`--line-strong`、`--ink-*`、`--accent`、`--amber`、`--hot`、`--ok`、`--radius-*`、`--ease-out-quart`。暗色模式不要写死颜色，参考现有的 `[data-theme="dark"]` 写法。

| 类名 | 规格 |
|---|---|
| `.time-bar` | 背景 `color-mix(in srgb, var(--surface) 92%, transparent)`，加 `backdrop-filter: blur(8px)`；左边框 3px `var(--amber)`；底边框 1px `var(--line)`。`lg` 断点：四边 1px 边框加圆角（已经由 `lg:rounded-tile` 处理）。 |
| `.time-dial` | 背景 `color-mix(in srgb, var(--amber) 9%, var(--surface))`。 |
| `.time-dial-face` | 背景 `var(--surface)`；1px `var(--line)` 边框；内阴影 `inset 0 1px 2px rgb(0 0 0 / .08)`。 |
| `.chronicle-window` | 内边距 10px 当外框，背景是黄铜渐变：`linear-gradient(135deg, color-mix(in srgb, var(--amber) 70%, #fff) , var(--amber), color-mix(in srgb, var(--amber) 60%, #000))`；四角各一个铆钉，用 `radial-gradient` 画；圆角 `--radius-panel`。内部图片 `aspect-ratio: 3/2`，圆角小于外框。`.is-forecast` 时外框改成 2px dashed `var(--amber)`，背景透明。 |
| `.chronicle-track` | `position: relative; height: 72px`；`cursor: ew-resize`；`touch-action: pan-y`；focus-visible 时显示 2px accent outline。 |
| `.chronicle-band` | `position: absolute; top: 0; bottom: 0`；背景 `var(--bg-sunk)`；`.is-odd` 用 `var(--bg-muted)`；`.is-forecast` 用 45° 的 `repeating-linear-gradient` 斜纹。 |
| `.chronicle-tick` | `position: absolute; top: 14px; height: 44px; width: 1.5px; transform: translateX(-50%)`。颜色按类别：cosmos `--ink-4`、life `--ok`、human `--amber`、energy `--hot`、compute `--accent`、ai `--accent-ink`、culture `--ink-3`。`.is-forecast` 时背景透明，改用 `border-left: 1.5px dashed`。 |
| `.chronicle-now` | 一条 1px 的点线，颜色 accent；内部的 `span` 是标签"现在"，定位在轨道上方，10.5px mono 字体。 |
| `.chronicle-needle` | 2px 宽，`var(--amber)` 色，贯穿全高；`::before` 画一个 12px 的圆形旋钮，在顶部，带阴影。只在开启动效时加 `transition: left 120ms`，并且拖动过程中禁用这个过渡：拖动时给轨道加 `data-dragging`。 |
| `.chronicle-scale` | `position: relative; height: 18px`；内部 `span` 绝对定位，`translateX(-50%)`，10.5px mono 字体，颜色 `--ink-4`，`white-space: nowrap`。 |

### 3.3 其余公开出口

- **`packages/backend/src/publication/sitemap.ts`**：在静态条目里加 `/chronicle`（受 `FEATURES.timeMachine` 控制），写法照搬 `/changelog`。
- **`packages/backend/src/publication/llms.ts`**：在站点页面部分加一行，介绍 `/chronicle` 和 `?at=`。
- **`apps/api/src/routes/og.ts`**：在页面字典里加一项：
  ```ts
  chronicle: { kicker: "四维视角", title: "在时间里自由穿行", subtitle: "从大爆炸到此刻，再到公开的预测：每个时刻，人类走到了哪里" }
  ```
- **`scripts/smoke.ts`**：开关开启时 `PAGES.push("/chronicle", "/hot?at=<昨天>")`，同时在 `MACHINE` 里加 `["/api/site/chronicle", /json/]`。
- **`docs/customize.md` §6**：说明 `timeMachine` 开关，以及换行业时如何替换 `industry/chronicle/` 或关闭它。
- **`docs/architecture.md`**：在出口表里补上 chronicle 接口，以及 `?at` 切片的说明。

### 3.4 配图流水线（只改脚本，不画图）

扩展 `tools/make-art.sh`，支持子目录：
- 输入：`~/Desktop/eacc-art/epochs/<era-id>.png`
- 输出：`apps/web/public/media/art/epochs/<era-id>-{1600,800}.webp`

可以复用现有的 cwebp 参数。脚本要自动遍历目录里实际存在的文件，不要硬编码清单，因为时代 id 以 `eras.json` 为准。

## 4. 数据格式（由 Claude 起草，路径 `industry/chronicle/`，你只读不写）

```jsonc
// eras.json
{ "_readme": "…", "eras": [ { "id": "big-bang", "from": -13.787e9, "title": "大爆炸", "summary": "…", "art": "big-bang", "artStyle": "深空天文摄影", "forecast": false } ] }
// milestones.json
{ "_readme": "…", "milestones": [ { "id": "watt-engine", "t": 1769, "precision": "year", "date": "1769", "title": "瓦特改良蒸汽机", "detail": "…", "category": "energy", "capability": "蒸汽动力", "source": "https://…", "forecast": { "by": "…", "url": "…" } } ] }
// metrics.json
{ "_readme": "…", "series": [ { "key": "population", "label": "世界人口", "unit": "人", "points": [[-10000, 4e6], …], "forecastFrom": 2025, "source": { "name": "…", "url": "…" }, "note": "…" } ] }
```

5 条指标的 key 依次是：`population`、`energy`（单位：瓦）、`compute`、`messaging`（单位：秒）、`travel`（单位：千米/时）。

数据文件已经就位，共 32 个时代、200 条里程碑、5 条指标，目前在等用户审定。审定过程中内容可能还会改，但格式不会变。

## 5. 测试

### 后端测试（`tests/`，命名和写法参照 `tests/publication.test.ts` 与 `tests/web-list-date.test.ts`）

**`tests/chronicle.test.ts`**：纯函数测试，不需要数据库。
- 测 `toAxis` / `fromAxis`：
  - 互为逆运算，在 1e-9 年精度内。
  - 大爆炸对应 0，`now + 100` 对应 1。
  - 函数单调。
- 测 `interpolateMetric`：
  - 早于第一个数据点时返回 null。
  - 晚于最后一个点时返回最后一个点的值。
  - 在两点中间时等于两者的几何平均。
- 测 `kardashev`：`kardashev(1e16) = 1`。
- 测 `timeLabel`：
  - -13.787e9 → `138亿年前`
  - -3200 → `公元前3201年`
  - 精确到日的日期 → `1969年7月20日`
- 测 `yearToDate(dateToYear(d)) === d`。
- 测 `withAt` 和 `stepAt` 的边界：今天和未来都回到 null；保留原有的 query 和 hash。这两个函数在 web 包里，测试放在 `apps/web/tests/` 下面，用纯 `node:test` 写。
- 校验真实数据文件。文件不存在时用 `test.skip`，并打印原因。要检查：
  - id 唯一。
  - 按时间排序。
  - 每个 `source` 都是 http(s) 链接。
  - 所有预测都有 `forecast.by` 和 `forecast.url`，并且时间晚于现在。
  - 精度、`date` 字段与 `t` 一致。
  - 指标数据点按时间递增，取值大于 0。
  - 每个 era 的 `art` 都匹配 `^[a-z0-9-]+$`。

**`tests/time-machine.test.ts`**：需要数据库，参照 `publication.test.ts` 的 `before`/`after` 写法和 `tag()`。
- 往 `hot_rankings` 插三条记录：D-1 的 10:00、D-1 的 23:00、D 的 09:00（都是北京时间）。断言 `GET /api/site/hot?at=<D-1>` 取到的是 23:00 那一条。
- 测 `pruneHotRankings(now)`：插入 40 天前同一天的 3 条，加 5 天前的 2 条，执行后 40 天前那天只剩最后一条，5 天前的两条都还在。
- 往 `lb_runs` 插两次已发布的运行：带 `at` 时取到较早的那一次；早于第一次运行的日期返回 404。如果构造 `lb_rankings` 太繁琐，可以只测 `runView(asOf)` 选中的 run id，用 `buildRunView` 的最小数据。
- 测 `/api/site/timeline?at=`：`visible_after` 晚于该日结束的精选不出现，`refreshAt` 为 null。
- `at` 是未来日期或格式错误时返回 400；`at` 等于今天时，结果和不带 `at` 一样。
- 测 `/api/site/reports/daily/at/<D>`：返回不晚于 D 的最新一期 key。
- 测 `/api/site/chronicle/bounds`：返回的字段齐全。

### Web 测试（`apps/web/tests/`）

在 `motion-fixture.ts` 的假 API 里加入以下数据，或者新建一个独立的 fixture（推荐新建，避免和动效测试互相干扰）：
- 带 `at` 的 `/api/site/hot` 返回一份带日期的数据。
- `/api/site/chronicle` 返回 3 个时代、6 条里程碑、2 条指标。
- `/api/site/chronicle/bounds`。

要断言的内容：
- `/hot?at=2026-09-01` 的 HTML 里出现那天的条目和"时光机停在"，并且只出现一次。
- 侧栏和底栏的链接带 `?at=2026-09-01`。
- 带 `at` 的页面有 `noindex`，响应里没有 `Set-Cookie`，`canonical` 不带 `at`。
- `/chronicle?t=1769` 服务端渲染出"蒸汽"时代的标题和 `timeLabel`。
- 功能开关关闭时 `/chronicle` 返回 404。这一项可以跳过，因为开关是编译期常量。

### 必跑命令（全部通过才算完成）

```bash
npm run typecheck
docker start eacc-pg-test   # 已有容器，端口 55433
DATABASE_URL=postgres://postgres:t@127.0.0.1:55433/eacc_test node scripts/migrate.ts
DATABASE_URL=postgres://postgres:t@127.0.0.1:55433/eacc_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
```

数据库口令以容器的实际配置为准（`docker inspect eacc-pg-test` 查环境变量）。库名必须以 `_test` 结尾。

### 运行验证

1. 本机按 `docs/deploy.md` 起 api 和 web，端口 3001 和 3000。
2. 跑 `node scripts/smoke.ts --base http://localhost:3000`。
3. 手动检查以下页面：
   - `/chronicle`：拖动、按键、点击吸附都正常，前进和后退能恢复位置，手机宽度和暗色模式都正常。
   - `/hot?at=…`、`/?at=…`、`/leaderboard?at=…`、`/daily?at=…`。
   - 拨盘：前一天和后一天按钮、日期选择器、从时光机回到现在。

## 6. 完成时交付

- 改动的文件清单，分成"新增"和"修改"两组。
- 每条必跑命令的结果，原样粘贴最后几行。
- 与本文档不一致的地方，以及你这样做的原因。
- 没做完或没验证的项目，如实列出。

## 7. 不在本次范围

- MCP 和 v1 公开接口暂不增加时光机。
- 生产环境已经被删掉的超过 30 天的热点榜不做恢复。
- 模型榜的价格不做历史化，页面上已说明价格是当前价。

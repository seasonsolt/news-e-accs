# 加速史场景

从加速史某个里程碑的插画"走进去"的三维场景。第一个是 1822 差分机工坊（`/chronicle/difference-engine`，中文 `/zh/chronicle/difference-engine`）。

## 怎么进入

- 桌面端（宽度 ≥ 961px、有鼠标、没有关闭动效）：`/chronicle` 的插画由纵深隧道绘制（`apps/web/app/features/chrono/depth-tunnel.ts`）。停在有场景的里程碑上时，隧道在观测舱里用同样大小的 iframe 预先打开 `<场景地址>?embed`，场景暂停在原画视角；读者点「走进工坊」后两边按 `scene-handoff.ts` 的消息交接（`ready` → `enter` → `entered`，返回时 `exit`），只接受同源、来自对方窗口的消息。
- 其他情况（手机、触屏、关闭动效、没有 WebGL）：「走进工坊」是普通链接，打开场景的独立页面；手机上不显示这个入口。
- 场景页自己画全部界面（路由 `handle` 的 `bare`），不带站点导航。three.js 只在场景页和桌面端隧道里按需加载，服务端不渲染画布。

场景列在 `scenes.ts`：`id` 是 `web/<id>/` 和 `assets/<id>/` 的目录名，`milestone` 是 `industry/chronicle/milestones.json` 里的里程碑，`label` 是入口按钮的文字。`web.tsx` 把它们交给加速史页面（`WebModule.chronicle.scenes`）。

## 贴图放在 R2

贴图不进 git，也不随新闻站发布：

| 位置 | 内容 |
|---|---|
| `assets/<id>/sources.json` | 每张贴图的原始文件名、来源地址或 R2 键、MD5、授权、输出宽度和 WebP 质量（进 git） |
| `.data/scene-sources/<id>/` | 原始文件（本机，不进 git） |
| R2 桶 `e-acc` 的 `scene-sources/<id>/` | 没有公开来源的原始文件（例如模型生成的图），私有 |
| `apps/web/public/media/scenes/<id>/` | 构建出的 WebP，本机开发直接由网站提供（不进 git） |
| R2 桶 `e-acc` 的 `scenes/<id>/` | 同样的 WebP，线上由入口 Worker 在 `/media/scenes/<id>/<文件>` 提供 |
| `web/<id>/manifest.json` | 贴图名 → 带内容哈希的文件名，场景代码只从这里取地址（进 git） |

文件名里带内容哈希，所以每个地址的内容永远不变，Worker 给 `immutable` 一年缓存；贴图换了就是新地址。入口 Worker 只读桶里的 `scenes/` 前缀（`deploy/edge/src/scenes.mjs`），`wallpapers/` 和 `scene-sources/` 不会对外。

```bash
node modules/scenes/scripts/assets.ts build difference-engine-1822    # 取原始文件、校验 MD5、生成 WebP 和 manifest.json
node modules/scenes/scripts/assets.ts upload difference-engine-1822   # 把 manifest 里的文件传到 R2（需要已登录的 cf CLI）
```

发布顺序：先 `upload`，确认 `https://e-acc.ai/media/scenes/<id>/<文件>` 能打开，再发布新闻站。旧文件留在桶里，已经缓存的旧页面仍能取到；确认没有页面引用后再删。

## 新增一个场景

1. 在 `scenes.ts` 加一条，在 `web/<id>/` 写 `page.tsx`、`messages.ts`（中文文案为键，`en` 是英文）和场景代码，参照 `difference-engine-1822`。`module.ts` 会按 `scenes.ts` 注册中英文路由。
2. 原画视角要和这个里程碑的插画对齐：隧道停在插画上时，场景以同样的取景（插画 3:2、`object-fit: cover`）开始。
3. 在 `assets/<id>/sources.json` 记下每张贴图的来源和授权，`build` 之后检查 manifest，再 `upload`。

## 1822 差分机工坊的素材

扫描材质来自 [Poly Haven](https://polyhaven.com/)，授权 [CC0](https://polyhaven.com/license)：木地板、木机架和工作台用 [Old Wooden Floor 03](https://polyhaven.com/a/old_wooden_floor_03)，拱窗和石材用 [Old Stone Wall](https://polyhaven.com/a/old_stone_wall)，灰泥墙用 [Plastered Wall 03](https://polyhaven.com/a/plastered_wall_03)。黄铜、铸铁和钢材的细纹由 `materials.ts` 在浏览器里生成。

`engineering-plate` 是模型生成的装饰性工程蚀刻图，提示词在 `assets/difference-engine-1822/engineering-plate.prompt.txt`，原图在 R2 的 `scene-sources/`。它只用于房间里的纸张和图板，不是历史机构图。

场景是艺术概念复原：1822 年是巴贝奇提出差分机的年份，完整的工坊和机器不代表当年已有的实物。演示的平方数表用有限差分计算（`calculation.ts`），机械动画只示意原理。

# 2026 工坊：连续虚拟窗景与光影验证

2026-10-25，分支 `codex/chronicle-more-workshops`。本记录区分本地实现、浏览器验证和发布状态，不代表用户已认可最终画质。

## 最终实现范围

- 三扇窗展示同一张 2172×724 连续全景的相邻区段，同步切换富士山、巴黎和长城；不是三地同时显示。窗景是虚拟屏内容，室内房间、窗框、设备和原有交互仍为三维场景。
- 初始进入持续 coding 的 03/04 阶段。主屏与竖屏通过克制的代码行高亮、光标表达本地播放，屏内保持 ASCII 英文；不表示真实外部任务或实测硬件负载。
- 任务阶段推进触发窗景过渡，活动场景每十秒轮换；减弱动态效果时停止自动轮换，手动阶段操作仍立即切换。
- 窗景对应的区域灯随过渡改变光色；切换完成后更新室内环境反射。静态合并保留对象的投影、接影属性。
- 窗景由内置 imagegen 生成。提示词及来源记录位于 `modules/scenes/assets/agents-2026/window-scenes.prompt.md`、`sources.json` 和 `generated-sources.json`。

## 浏览器事实

以下为主执行者在内置浏览器对最终全景版本的实际检查记录：

- 初始处于 coding 03/04；三扇窗共享富士山全景，UV 横向 offset 为 `[.02482, .35106, .67730]`，repeat.x 为 `.29787`。
- 手动推进到 stage 3 后同步切到巴黎；继续运行自动切到长城。
- 轮换期间 renderer 纹理数保持 49，没有观察到纹理数量随轮换增长；这不等于长期内存压力测试。
- reset 到 stage 0 恢复富士山。
- 减弱动态效果下观察 11 秒，没有自动切换；手动操作立即切到长城。
- 英文移动端以 390×844 检查，无横向溢出；在 Canvas 上点击实体旋钮控制台，03/04 推进至 04/04。设备显示与外层页面均为英文，未见浏览器警告或错误。
- 从时间线 `?t=2026.8` 进入同源 iframe，初始为 coding 03/04；在 iframe 内推进至 04/04，再返回时间线，`.chronicle-stage.is-inside` 与 `iframe.observatory-scene.is-open` 均已清除。
- 共享几何合并调整后，实际打开石器、用火两幕，场景正常显示且无错误信息；此项为视觉加载回归，不是重新验收所有历史工坊细节。
- 完成后清除临时视口与减少动效模拟，保留普通 `/zh/chronicle/agents` 预览页；最终截图来自未带 debug 的普通页面。

最终构建的浏览器原始截图：

- [富士山与持续 coding](panorama-fuji-coding.png)
- [巴黎连续窗景](panorama-paris.png)
- [长城连续窗景](panorama-great-wall.png)
- [英文编码近景](coding-close.png)
- [英文移动端实体点击后](mobile-english.png)


## 自动检查

| 检查 | 实际结果与边界 |
|---|---|
| 最终 Web 构建 | 通过；`/tmp/eacc-panorama-build.log` 记录构建成功。 |
| 最终类型检查 | 通过，调用确认退出 0；`/tmp/eacc-panorama-typecheck.log`。 |
| 最终 focused 测试 | 44 项：43 通过、0 失败、1 跳过；`/tmp/eacc-panorama-focused.log`。覆盖英文屏幕、编码动画、全景轮换、连续过渡、复位、减弱动态效果和场景时钟暂停等。 |
| 最终完整 Web 测试 | `--test-concurrency=2`：172 项，171 通过、0 失败、1 跳过；`/tmp/eacc-panorama-webtests.log`。另有迁移至 `apps/web/tests/workshop-geometry.test.ts` 的几何测试 1 项通过。 |
| 较早默认并发 Web 测试 | 172 项：169 通过、2 失败、1 跳过；两项失败随后隔离运行通过。结果提示并发或时序敏感，不能据此声称其根因已修复。 |
| 较早完整后端测试 | 1028 项：1016 通过、9 失败、3 跳过；`/tmp/eacc-lighting-backend.log`。8 项备份相关失败有 `pg_dump 16.11` 与 PostgreSQL `17.11` 不兼容的明确错误，另 1 项为 secure-proxy TLS 测试失败。该运行早于新增窗景测试，本轮窗景没有后端改动，不能把它记作最终版本全栈通过。 |
| 最终本地 smoke | 34 项通过，1 项 `/og/site.png` 超时，退出 1；`/tmp/eacc-panorama-smoke.log`。不能记为全部通过。 |

## 状态边界

尚未提交推送，未上传 R2，未发布生产。本文与截图证明本地构建及列出的行为检查，不证明生产资源可用、远端 CI 通过、所有设备性能达标或最终画质已获用户认可。

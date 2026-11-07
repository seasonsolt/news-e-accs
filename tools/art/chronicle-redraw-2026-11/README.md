# Chronicle 插画重绘 · 2026-11

早期批次里有一部分图看起来是通用 AI 渲染：油亮的光球、千篇一律的暖光书桌和窗外山水，有的还带着提示词明确禁止的代码、数字和符号。这批用 codex CLI 的内置图片生成工具重绘 28 张、新画 1 张，原图 1536×1024，保存在 `plates/`，完整提示词在 `prompts/`，画风和英文画风在 `plates.json`。古代到 2000 年代按时代风格绘制的图质量稳定，没有重绘。

原图的 C2PA 元数据只写 `gpt-image`，不带版本号，所以范围是逐张看图定的，不是按模型版本筛的。

| 素材键 | 画风 | 构图 |
|---|---|---|
| `amazon-s3-v2` | 2000年代企业年报摄影 | 按用量租用：一排储物柜和一块电表 |
| `crispr-v2` | 科学期刊封面剪纸 | 一条引导纸片带着剪刀，在 DNA 纸带上剪开一处 |
| `chatgpt-v2` | 2022年纪实摄影 | 深夜洗衣房里，三个陌生人各自对着同一种屏幕光 |
| `openai-o1-v2` | 长曝光静物摄影 | 一摞草稿之后才有一张干净的答案 |
| `computer-use-v2` | 操作手册线稿 | 操作手册里的虚线手：没有人，但鼠标和键盘在动 |
| `alexnet-classification-v2` | 2012年数码快照 | 学生房间里的两张游戏显卡和满墙照片 |
| `gpt-5-v2` | 夜间铁路航拍 | 快车和货车汇入同一组道岔，即路由 |
| `gpt-6-sol-luna-v2` | 大画幅风光摄影 | 同时出现在地平线上的日与月 |
| `forecast-agent-teams-v2` | 近未来纪实摄影 | 三段指示灯的值班室，人在清单上签字 |
| `forecast-personal-ai-v2` | 近未来纪实摄影 | 无信号的隧道里，手机和电脑接续同一任务 |
| `forecast-useful-robots-v2` | 近未来纪实摄影 | 栏杆内的机械臂，背景里有人在修故障 |
| `forecast-science-loop-v2` | 近未来纪实摄影 | 自动化实验台，失败的板子进废料箱，人手记结果 |
| `forecast-grid-compute-v2` | 近未来航空摄影 | 还没接通的冬季工地：输电线、储能和机房 |
| `forecast-interactive-worlds-v2` | 近未来片场摄影 | LED 片场露出接缝，机器人在生成的厨房里练习 |
| `large-models-v2` | 2023年纪实摄影 | 同一栋楼里不同的人都在用同一种屏幕 |
| `internet-v2` | 1990年代像素风 | 一条电话线把世界接进卧室 |
| `social-web-v2` | 2000年代卡片机快照 | 合租屋里看家庭录像，墙边堆着网店包裹 |
| `mobile-internet-v2` | 2010年代地铁纪实摄影 | 早高峰地铁里全体低头 |
| `abundance-speculative-v2` | 太阳朋克水粉概念画 | 保留铅笔虚线的太阳朋克河城 |
| `deep-learning-lab-v2` | 2010年代实验室胶片 | 储物间改成的 GPU 实验室 |
| `alphago-match-v2` | 2016年赛事新闻摄影 | 棋手落子，对面是屏幕和操作员 |
| `language-pretraining-v2` | 2010年代工业黑白摄影 | 一座仓库的无标注书籍被切成纸页长河 |
| `coding-copilot-v2` | 2021年居家办公纪实 | 过肩视角：屏幕上一行灰色建议等待接受 |
| `text-to-image-v2` | 暗房摄影 | 暗房药水里浮现画面，底片位置只有一张纸条 |
| `multimodal-understanding-v2` | 编辑静物摄影 | 餐巾纸草图和电脑上做好的页面 |
| `model-tool-use-v2` | 中世纪现代丝网海报 | 工具板上，一根红线从扬声器插到电话 |
| `text-to-video-v2` | 微距静物摄影 | 翻页书里的小船驶上桌面的水 |
| `realtime-voice-vision-v2` | 生活纪实摄影 | 一边修车一边和手机说话，手机看着链条 |
| `reasoning-model-v2` | 手绘地形图 | 地形图上擦掉的铅笔路线和最后一条红线 |

`social-web-v2` 是新图：“社交网络”时代此前和“互联网”共用一张拨号上网的画面。`large-models-v2` 从数据中心改成普通人的日常，和时代简介一致。预测系列的素材键同时用于时代和事件。这些都是原创插画，不是新闻照片或产品截图。

## 复现

```bash
tools/art/chronicle-redraw-2026-11/gen.sh <art>...                       # 按提示词重画，四张并行
cwebp -q 68 -resize <800|1600> 0 plates/<art>.png -o apps/web/public/media/art/<group>/<art>-<800|1600>.webp
python3 tools/upscale-chronicle.py tools/art/chronicle-upscale-2026-10-27/manifest.json \
  --binary ~/Applications/realesrgan/realesrgan-ncnn-vulkan --state-dir .data/chronicle-upscale-redraw --only <art>
uv run tools/make-depth.py apps/web/public/media/art/moments             # 只补缺失的深度图；epochs 同样
```

`make-depth.py` 的 `*-1600.webp` 也会匹配 `-hd-1600.webp`，产生多余的 `-hd-depth.webp`，跑完要删掉，不提交。

被替换的旧图：1600 宽版本归档在 `retired/`，`tools/art/phone-editions-2026-10/manifest.json` 里已发布手机壁纸的 `source` 改指归档。已排期的壁纸是独立文件，不受这次重绘影响，仍是旧画面。

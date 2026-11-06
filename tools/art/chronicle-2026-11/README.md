# Chronicle 插画 · 2026-11（2026 年度节点）

六张原创场景插画，用 codex CLI 的内置图片生成工具绘制，原图 1536×1024，保存在 `moments/`，完整提示词在 `prompts/`。不是新闻照片或产品截图。事实依据和未收录的条目见[核查记录](../../../docs/chronicle/year-review-2026.md)。

| 里程碑 | 画风 | 构图 |
|---|---|---|
| `openclaw-personal-agent` | 纪实街拍摄影 | 排队抱着小主机的人，路面上有龙虾钳的影子 |
| `seedance-2` | 电影剧照 | 成千上万条竖屏短片汇成一束光，凝成一场真实的戏 |
| `sora-app-shutdown` | 1970 年代彩色反转片 | 荒漠里废弃的汽车影院，银幕空白，远处工厂亮着灯 |
| `when-ai-builds-itself` | 二十世纪中期数学石版画 | 机械臂一代造一代，人越来越小，尽头只剩一张空凳子 |
| `memory-hardware-rally` | 荷兰黄金时代静物油画 | 明亮窗光下的硬盘、内存条和金币，加一朵开始低垂的郁金香 |
| `qwen-3-8-27b` | 微缩移轴摄影 | 瓶中的超大规模数据中心，放在家里的餐桌上 |

## 复现

```bash
tools/art/chronicle-2026-11/gen.sh <id>                                # 按提示词重画一张
tools/make-art.sh tools/art/chronicle-2026-11                          # 800/1600 WebP
uv run tools/make-depth.py apps/web/public/media/art/moments           # 只补缺失的深度图
python3 tools/upscale-chronicle.py tools/art/chronicle-upscale-2026-10-27/manifest.json \
  --binary ~/Applications/realesrgan/realesrgan-ncnn-vulkan --state-dir .data/chronicle-upscale-2026-11 --only <id>
```

`make-depth.py` 的 `*-1600.webp` 也会匹配 `-hd-1600.webp`，产生多余的 `-hd-depth.webp`，跑完要删掉，不提交。

这批没有做壁纸，也没有排进 `/admin/wallpapers`。

# Chronicle 技术史配图核查 · 2026-10-27

本批四张使用内置 imagegen 分别生成，逐张检查原图后重新绘制；均为经过历史资料约束的原创插画，不是档案照片或精确器物复刻。原图与最终英文提示词保存在 `moments/<新素材键>.{png,prompt.txt}`。网页输出 800/1600 WebP，采用新素材键避免客户端和边缘缓存继续显示旧图。

| 事件 | 原图实际问题 | 重绘主体与新素材键 |
|---|---|---|
| iPhone 发布，2007 | 旧图是接近全面屏的现代手机，无原代显著的圆形实体 Home 键，且未来建筑削弱发布年代识别。 | `iphone-2007-v2`：紧凑原代手机，银色边框、黑色前面板、粗上下边框、圆形 Home 键、小屏幕与早期图标。 |
| CUDA，2007 | 旧图以巨大的现代开放式散热器、裸露发光处理器和科幻机房表示 GPU，器物形态与早期 CUDA 年代不符。 | `cuda-2007-v2`：2007 年工作站桌面和 G80 / GeForce 8800 时代双槽显卡，单个离心涡轮、矩形导风罩、DVI 接口和 PCI Express 金手指。 |
| 万维网公开，1991 | 旧图办公室窗外直接出现 LHC 式蓝色加速器阵列；这种场景错误地把后来大型装置拼接到早期 Web 办公室。 | `world-wide-web-1991-v2`：普通 CERN 办公环境，黑色 NeXT 立方主机、方形 CRT、键盘及有线鼠标；不再使用加速器背景。 |
| 实用太阳能电池，1954 | 旧图用现代玻璃封装网格光伏板和类似西雅图太空针塔的城市轮廓，混入后来的器物和建筑。 | `silicon-solar-cell-1954-v2`：小条裸硅试片、细导线、简单马达和指针仪表组成的实验室演示，而非现代屋顶组件。六条试片的安排是插画构图，不声称精确复制某件档案原型。 |

## 事实依据

- Apple 2007 年 1 月 9 日发布材料明确为原代 iPhone，并记载 3.5 英寸多点触控屏：[Apple Reinvents the Phone with iPhone](https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/)。
- NVIDIA 官方技术简报记载 GeForce 8800 在 2006 年 11 月推出，GeForce 8/9 支持 CUDA：[GeForce GTX 200 GPU Technical Brief](https://www.nvidia.com/docs/IO/55506/GeForce_GTX_200_GPU_Technical_Brief.pdf)；官方保留的 2007 年 CUDA 工具包列出 GeForce 8800 支持：[CUDA Toolkit 1.1](https://developer.nvidia.com/content/cuda-toolkit-11-june-2007?display%5B%24ne%5D=defaultnppcuda-toolkit-41)。这些资料约束硬件年代，不把新图当作某块品牌卡的精确复制。
- CERN 记载第一个网站运行在 Berners-Lee 的 NeXT 电脑上：[The birth of the Web](https://home.cern/science/computing/the-birth-of-the-web)。
- 1954 年同期 ACS 报道给出贝尔实验室硅太阳能电池及薄硅条约 0.5×2 英寸的尺寸：[Electricity from Sunlight](https://pubs.acs.org/doi/10.1021/cen-v032n018.p1768)。Smithsonian 的实验硅太阳能电池藏品记录也确认 1954 年及 Chapin、Fuller、Pearson 的工作：[Experimental silicon solar cell](https://collections.si.edu/search/detail/edanmdm%3Anmah_713146)。本次不改变事件原有年份或文案。

## 集成与保留项

- `industry/chronicle/milestones.json` 更新上述四个节点的 `art` 和 `artStyle`；`industry/chronicle/en.json` 更新对应英文 `artStyle`，事件 ID 与时间保持不变。
- 原来的四套 public WebP 已退役：1600 版归档到本目录 `retired/moments/`，`tools/art/phone-editions-2026-10/manifest.json` 仅将四处历史 `source` 改指归档，原有 `art`、画风、portrait 和其他壁纸映射保持不变；旧 public 800/1600/depth 已删除。历史批次仍可追溯原始生成输入，公开页面只引用新配图。
- 转换：`cwebp -q 68 -resize <800|1600> 0`；深度：使用仓库 `tools/make-depth.py` 的 Depth Anything V2 Small，仅处理本批四个新素材键。
- 原图逐张目视检查通过：主体具备所需年代特征，无新增品牌字样或可读水印。页面遮罩、移动端裁切及完整工程测试由主任务统一验收。
- `docs/art-prompts.md` 对应四项已同步新素材键、画风与年代正确的器物构图；完整最终生成提示词仍保存在每张原图旁边。

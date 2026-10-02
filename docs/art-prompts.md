# 插画提示词（e/acc 蒸汽朋克风格）

用途：网站阅读页的背景动效、分类头图、日报报头、空状态。风格以 `tools/make-media.sh` 用到的那批插画为准
（羊皮纸上的古董工程版画、棕褐墨线交叉排线、黄铜和紫铜点缀）。

## 怎么画

1. 在 ChatGPT 里新开一个对话，**先发「统一风格」那一段**，再逐张发下面的提示词。同一个对话里画，风格最稳定。
2. 每张都要 **横版 3:2（1536×1024）**。ChatGPT 默认给方图的话，补一句"横版 3:2"。
3. 每张可以多画几次，挑最好的一张，**按表里的文件名保存**到 `~/Desktop/eacc-art/`（PNG 原图就行，压缩我来做）。
4. 画面里**不要出现文字、字母、数字和 logo**（AI 画的字是乱码，网站上的字由网页自己显示）。

## 统一风格（每个新对话先发这一段）

> From now on, every image you make in this chat follows one fixed style: an antique engineering engraving
> on aged parchment, like a page from a Victorian inventor's notebook. Fine sepia-brown ink linework with
> cross-hatching, technical-drawing details (faint construction lines, small measurement marks without
> numbers), selective brass and copper accents with a soft warm glow, muted palette of parchment, sepia,
> brass, copper and deep teal. Steampunk machinery, gears, pipes, valves, pressure gauges. Calm, detailed,
> wonder-inspiring. Generous empty parchment around the subject so text can sit on top. No text, no letters,
> no numbers, no logos, no watermark, no modern screens with UI. Landscape 3:2.

## 图片清单

| 文件名 | 用在哪里 | 提示词（发在「统一风格」之后） |
|---|---|---|
| `ambient-engine-room.png` | 首页和精选页的背景动效（很淡，慢慢平移） | A vast steampunk engine room seen from a high balcony: rows of giant flywheels, belts and boilers fading into haze, very low contrast, mostly empty parchment in the center third. |
| `masthead-daily.png` | 日报页顶部报头 | A grand steam-powered printing press producing a long ribbon of freshly printed paper that curls across the page, brass rollers, ink wells, the top center left empty for a title. |
| `cat-models.png` | 「模型」分类 | A colossal clockwork thinking engine shaped vaguely like a brain made of interlocking brass gears and copper tubes, tiny engineers on ladders tending it. |
| `cat-products.png` | 「产品」分类 | A steampunk assembly line where brass automatons assemble small elegant devices that roll off a conveyor into wooden crates. |
| `cat-industry.png` | 「行业」分类 | A steampunk industrial skyline: factories, smokestacks, a rail viaduct and two airships, seen as an engraved panorama, steam rising. |
| `cat-papers.png` | 「论文」分类 | An inventor's study: a desk covered with blueprints and open notebooks, a brass telescope, a quill, a glass orrery, a calculating machine. |
| `cat-tips.png` | 「教程」分类 | A tidy workbench with labeled-looking (but textless) drawers, precision tools laid out, an open instruction manual with diagrams, a small machine half assembled. |
| `cat-opinion.png` | 「观点」分类 | Two elegant automatons debating at brass lecterns, a large gramophone horn between them, speech drawn as curling steam. |
| `first-party.png` | 「一手」频道（官方发布） | A heavy brass seal press stamping a wax seal onto a scroll, ribbons and a signet ring, official and ceremonial. |
| `hot.png` | 热点榜 | A huge boiler with a large pressure gauge whose needle swings into the high zone, valves venting jets of steam, a warm copper glow. |
| `topics.png` | 主题页 | A towering card-catalogue cabinet with hundreds of small brass-handled drawers, a rolling ladder, a few drawers open with cards. |
| `subscribe.png` | 订阅、日报邮件 | A pneumatic-tube mail system: brass capsules carrying rolled letters shoot through glass tubes into a row of mailboxes at dawn. |
| `empty.png` | 空状态、404 | A quiet idle machine at rest: an automaton sitting asleep on a stool beside an empty conveyor, a cup of tea, soft evening light. |

画好放进 `~/Desktop/eacc-arteacc-art/` 以后，告诉我一声即可。

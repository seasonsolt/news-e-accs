# 工坊第二版素材

扫描材质取自 [Poly Haven](https://polyhaven.com/)，遵循 [CC0](https://polyhaven.com/license)。运行时只加载本目录中的文件，不依赖第三方连接。

| 本地文件 | 原素材 | 用途 |
|---|---|---|
| `wood-{color,normal,roughness,ao}.jpg` | [Old Wooden Floor 03](https://polyhaven.com/a/old_wooden_floor_03) | 木地板、木机架和工作台 |
| `stone-{color,normal,roughness,ao}.jpg` | [Old Stone Wall](https://polyhaven.com/a/old_stone_wall) | 拱窗、窗台和石材细节 |
| `plaster-{color,normal,roughness,ao}.jpg` | [Plastered Wall 03](https://polyhaven.com/a/plastered_wall_03) | 大面积旧灰泥墙 |

颜色与法线为 2K，粗糙度与遮蔽为 1K。`sources.json` 保留下载地址、原站页面、尺寸和官方 MD5。黄铜、铸铁与钢材的细纹和氧化斑由 `materials.js` 在本地生成。

`engineering-plate-v2.png` 由内置 **image_gen** 工具生成；完整最终提示词保存在 [`engineering-plate.prompt.txt`](engineering-plate.prompt.txt)。这是一张新生成的装饰性工程蚀刻图，用于三维房间内的纸张和图板，不是精确历史机构图，也没有替代三维机器本身。

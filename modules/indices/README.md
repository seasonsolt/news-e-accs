# 加速指数（`/index/*`）

第二阶段的指数页（`docs/plans/phase-two.md`）。目前只有一条：智能成本（`/index/cost-of-intelligence`，设计见 `docs/plans/cost-of-intelligence.md`）。

## 智能成本

对 GPQA Diamond 的四个档（35%、50%、75%、90%），画出每个日期能买到的最便宜的第一方官方 API 价格（输入、输出按 3:1 混合，每百万 token，美元）。页首给出每档首次达到时的价格是现在的几倍，以及对数线性拟合得出的“每几个月减半”。

- **数据**：GPQA 分数读模型榜最新的 `epoch-gpqa` 快照，每个模型取各配置的最高分；当前价读 `lb_prices`（`kind = 'official'`）；人民币按 `fx_rates` 最新的 USD/CNY 折算。历史价格在 `seeds/price-history.json`，每条有生效日期、官方出处和是否已核验。当前价和历史最后一条不同时，按核验日期算作一次降价；没有历史的模型，当前价从发布日起算。
- **不建表**：读取时现算，进程内缓存 10 分钟。新模型同时有官方价和 GPQA 分就自动并入；以后有降价，在 `price-history.json` 加一条并附出处。
- **出口**：页面 `/index/cost-of-intelligence`（`/zh` 镜像），`/api/site/indices/cost-of-intelligence`（JSON），`/api/site/indices/cost-of-intelligence.csv`（每一级一行，带出处）；sitemap 和 llms.txt 各一条；页面带 Dataset 结构化数据，署名 Epoch AI（CC BY 4.0）。图表是服务端渲染的 SVG，不用前端图表库；读者打开页面不触发模型调用。
- **未核验的价格**在图上是空心点，表格里标“待核验”。

模块之间不互相导入：模型榜的数据通过数据库读取。

## 测试

`tests/cost-of-intelligence.test.ts` 覆盖阶梯线、同价不算一级、当前价接续历史、汇率、减半时间和价格文件的格式；`tests/indices-module.test.ts` 用数据库夹具检查接口、CSV、sitemap、llms.txt 和中英文页面。

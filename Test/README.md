# 继承的上游回归测试

来源：AIsouler/MyClash `4861619be366c7bacabfed6d581bb8c450de1ca1`，MIT。

在仓库根执行 `npm ci`、`node Test/run-tests.js`。只测试全量 `Script/mihomoScript.js`，不分发精简版。

原测试覆盖地区、倍率、不可见字符、节点补旗、去重、dialer-proxy、hosts 回环/链式映射、私有 DNS 策略、Fake-IP 过滤、自定义节点与链式代理。ES2026 与真实 QuickJS 检查也包含在入口中。

Node 回归默认显式关闭派生的严格模式和 Apple 新服务，以核对原算法的兼容行为；完整默认行为、所有开关及配置生成在 `tests/config.test.js` 单独验证。测试识别新增 `dns` 辅助出站，不把它算作机场节点。QuickJS 用实际默认配置执行 `main()`。

`npm test` 同时运行这两层检查；`npm run check` 检查默认 YAML 是否与源码一致。不要只运行兼容层就宣称严格模式已验证。

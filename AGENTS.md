# 项目维护约定

- 基于 AIsouler/MyClash `4861619be366c7bacabfed6d581bb8c450de1ca1` 全量版；原作者建议保存在 `docs/upstream/AGENT.md`。图标沿用原始 URL，不修改 SVG，遵守其中的兼容性与命名约定，禁止补回 CDN 域名直连规则。
- 对外只维护 `Script/mihomoScript.js` 和 `Config/mihomoConfig.yaml` 两个全量产物，不增加精简版。
- 脚本是规则和选项的单一来源，YAML 通过 `npm run build` 生成。静态 YAML 的扩展开关需要重新生成才生效，不能声称内核会执行扩展字段。
- 保留上游地区/倍率/零宽字符/去重/dialer-proxy/私有 DNS 与 hosts 的算法及测试。行为变更必须有明确回归证据。
- 严格加密 DNS 禁止 system、DHCP、明文 UDP/TCP DNS 和跳过证书校验。私有明文解析无法兼容时失败，不静默回退。
- Apple AI/Siri 精确规则必须先于广告、Apple 国内规则与 QUIC 屏蔽。不得用整个 Apple、Cloudflare 或 17/8 代理代替精细分流。
- 修改后运行 `npm test`、`npm run check` 和可获得的 Mihomo 原生配置校验。不得把配置检查当成用户运营商网络抓包实测。
- 不提交机场订阅链接、密码、实际节点、缓存或运行日志。

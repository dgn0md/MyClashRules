# myClashRules

基于 [AIsouler/MyClash](https://github.com/AIsouler/MyClash) 全量版的 Mihomo 覆写项目，保留原作者的节点整理、地区/倍率/家宽分组、服务分流、私有 DNS/hosts 兼容、链式代理和 Bettbox 图形化开关；增加 Apple 智能与海外产品的精细分流，以及默认全加密的 DNS 上游。

只提供两个全量使用入口：

| 产物                                                 | 用途                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [Script/mihomoScript.js](Script/mihomoScript.js)     | 对机场展开后的配置执行全量覆写，推荐使用；节点处理能力完整 |
| [Config/mihomoConfig.yaml](Config/mihomoConfig.yaml) | 完整静态配置，填订阅后使用；也可通过同一脚本生成个人配置   |

没有精简版。适用于 Mihomo 客户端，原生验证版本为 **v1.19.34**。请关闭客户端额外的 DNS 覆写。订阅格式须为 Clash/Mihomo YAML，脚本输入需要有 `proxies` 数组。

## 使用脚本

将 `Script/mihomoScript.js` 导入支持 `main(config)` 的脚本覆写客户端。在顶部 `ruleOptionsEnable` 中修改 `true` / `false`，或使用 Bettbox 的图形化选项。正确拼写是 `true`；字符串 `"false"` 与 `ture` 均不是布尔值。

```text
https://raw.githubusercontent.com/dgn0md/myClashRules/main/Script/mihomoScript.js
```

自定义节点填 `customizeProxies`；开启 `链式代理` 后，自定义节点成为落地，“链式中转”只含订阅节点。脚本保留上游 hosts 回环判断、节点 DNS 策略提取、零宽名称识别、去重和 `dialer-proxy` 引用修复。

## 使用配置

```text
https://raw.githubusercontent.com/dgn0md/myClashRules/main/Config/mihomoConfig.yaml
```

1. 下载 YAML，修改底部 `proxy-providers.订阅.url` 为自己的订阅链接，然后导入客户端。
2. 默认所有常用服务组均开启；Apple/微软常规服务默认直连，Apple 智能、Siri、News、TV 等专用接口默认美国。可直接在客户端选择组出口。
3. 如需开关功能，修改顶部 `x-myClashRules.options` 的 `true/false`，运行以下生成命令，然后导入生成结果。

```sh
npm ci
node tools/build.js --settings Config/mihomoConfig.yaml --output .local/myConfig.yaml
```

**Mihomo 不会执行 `x-myClashRules` 开关。** 只编辑这些扩展字段而不重新生成，不会改变规则。静态配置不能从远程 provider 读取机场顶层的私有 DNS/hosts，无法自动重命名 provider 内节点，也不能动态隐藏空地区；无节点地区回退 `REJECT`。节点更新与地区/倍率过滤仍由内核的 provider 与正则实时完成。

要让 YAML 也完整执行脚本的节点/私有 DNS/hosts 算法，请先将机场配置保存到 `.local/subscription.yaml`，再生成：

```sh
node tools/build.js --settings Config/mihomoConfig.yaml --subscription .local/subscription.yaml --output .local/myConfig.yaml
```

此模式嵌入实际节点，需要更新订阅时重新生成。订阅和生成的个人配置可能包含密码，请放在已经忽略的 `.local/`，勿提交到仓库。

## Apple 精细分流

| 开关/组                                       | 默认  | 覆盖范围与取舍                                                                                              |
| --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `Apple智能` | true | PCC、Extensions、国际 gateway 与全部 `icloud-content.com` 内容；中国站 `.com.cn` 保留原规则 |
| `Siri`                                        | true  | Siri/听写和 `smoot` 搜索接口；搜索接口也被 Spotlight、Safari、News 等共享                                   |
| `AppleNews`                                   | true  | News/News+ 专用 API、内容及 `apple.news`，不会代理全部新闻网站                                              |
| `AppleTV`                                     | true  | TV/TV+ 专用接口与每日更新规则；部分 iTunes 播放接口是共享端点                                               |
| `AppleFitness` / `AppleSports` / `AppleBooks` | true  | 各自专用域名；共享购买、视频资源由相应媒体组处理                                                            |
| `Apple地区检测`                               | true  | `gspe1-ssl.ls.apple.com`，News 常用的地区判断接口；同时可能改变地图数据源及 eSIM/Watch 地区判断，可独立关闭 |
| `AppleRelay`                                  | false | iCloud Private Relay 三个官方入口；开启可能把 Safari 大量浏览流量送往代理，与节流目标存在取舍               |
| `Apple海外媒体`                               | false | 共享 iTunes 购买/媒体接口；需要海外 Books/Arcade 等授权时按需开启，会影响正常商店或 Music 流量              |
| `Apple模型下载直连`                           | true  | 系统/模型共用资源 CDN 直连，避免大下载占用代理                                                              |
| `Apple服务默认直连`                           | true  | 商店、更新、iCloud、Music 等普通 Apple 服务；专用例外优先                                                   |

这些是网络出口策略。账号/商店地区、硬件、系统语言、订阅、SIM 和服务端资格仍影响产品可用性。共享域名无法区分 HTTPS 路径内的不同产品；本项目不把所有 `apple.com`、`icloud.com` 或 `17.0.0.0/8` 强制代理。Fitness/Sports/Books 的专用入口分流不等于覆盖所有共享后端，实际缺失端点需根据连接日志补充。[Apple 端点与限制](docs/apple-routing.md) 给出来源及判断依据。

`Apple智能` 精确覆盖 `gateway.icloud.com`，并按用户选择通过 `DOMAIN-SUFFIX,icloud-content.com,Apple智能` 覆盖国际内容域本身及全部子域，包括 `ussjc1.icloud-content.com`、`edge-013.hkhkg2.icloud-content.com`、`cvws.icloud-content.com` 和未来的新命名结构。DNS 同步使用 `+.icloud-content.com` 经该组的 DoH，不再维护 edge 编号/地区正则或内联规则集。

中国站 `icloud-content.com.cn`、`gateway.icloud.com.cn` 不命中这些例外，继续原有 Apple/国内规则。此处的“非 CN”按国际站域名后缀判断，不保证解析出的 IP 实际位于境外。国际 iCloud 照片、文件、备份等内容也可能走代理并增加流量；这不是 Siri 专属识别，也不代表已确认 Siri 故障原因或恢复可用。更新后重新连接 VPN，让 `Apple智能` 与 `Siri` 选择同一可用出口，再检查新连接记录。

## DNS 设计与适用边界

默认 `严格加密DNS: true`：国内/节点/启动 DNS 使用固定 IP 的 AliDNS 与 DNSPod DoH，境外 DNS 经代理使用 DoH；没有明文 `fallback`，不使用系统 DNS 或跳过证书验证。DoH 不可用时失败，不降级到 UDP/53。Apple 专用域名使用对应组的境外 DNS，避免落入国内 DNS 策略。

TUN 的 `dns-hijack` 覆盖 TCP/UDP 53，`strict-route` 配合系统接管，额外 DNS 出站接管已经进入内核的 53 端口流量。内置 DNS 只监听 `127.0.0.1:1053`，默认不向局域网开放代理端口。大陆运营商无法直接读取这些上游加密 DNS 的查询内容，仍能观察连接 IP、时序等网络元数据，公共 DNS 提供者本身也能看到查询。

- **明文私有机场 DNS**：严格模式报错。请向机场取得 DoH/DoT、节点 hosts 映射或 IP；不会把只能由机场 DNS 解析的域名改送公共 DNS。`严格加密DNS: false` 可恢复兼容行为，但此时不再满足无明文上游的要求。
- **局域网名称**：严格模式不询问路由器/系统明文 DNS，LAN 私有域名默认空响应；请在生成结果 `hosts` 中显式配置，或部署自己的加密 LAN DNS。
- **系统覆盖**：须开启 TUN 并赋予客户端需要的权限。仅 HTTP/SOCKS 系统代理、未纳入网关的设备、其他 VPN、旁路接口和客户端额外覆写不能由此配置单独约束。Windows 需确认严格路由或关闭智能多宿主解析。
- **验证**：本项目有真实内核加载与结构验证；未在你的大陆运营商、真实机场和 Apple 设备上抓包，不把配置检查表述为环境实测。部署后按 [验收步骤](docs/validation.md) 检查 IPv4/IPv6 的 53 端口与 DNS 出口。

## 规则与流量

继续采用原作者的 [Bett Rules](https://github.com/appshubcc/bett-rules) MRS 动态规则，按需加载、每 86400 秒更新；包含优化 CN IP、国内服务例外和 Apple TV 细分。`cn` 域名库参与国内 DNS，不直接将全部 `cn-domain` 强制直连，保留原作者的 CN IP 兜底算法。

对照 [规则源评估](docs/rule-sources.md) 后，暂未用更大的聚合直连库覆盖现有规则。节流依靠国内服务/CDN 例外、普通 Apple/微软默认直连、模型资源直连、可选低倍率组与 PCDN 拦截。海外未知流量继续代理兜底，避免为了减少代理而让必需代理的流量误直连。没有用测试样本以外的数据宣称某规则源“绝对更精准”或给出节省比例。

## 开发与检查

```sh
npm ci
npm run build
npm test
npm run check
# 可选：联网下载公开规则，并使用已安装的官方 Mihomo
node tools/download-rules.js .local/rules
node tools/native-check.js /path/to/mihomo .local/rules
```

测试包括上游节点/DNS 兼容模式回归、ES2026 解析、QuickJS 实际执行，以及严格默认、所有布尔开关、Apple 优先级、依赖引用、链式循环和生成一致性。原生检查覆盖各开关配置及真实 MRS 加载；不会开启系统 TUN。

## 来源与许可

上游基线：[AIsouler/MyClash@4861619](https://github.com/AIsouler/MyClash/commit/4861619be366c7bacabfed6d581bb8c450de1ca1)。保留 [原作者 AGENT.md](docs/upstream/AGENT.md) 与 [MIT 许可](docs/upstream/LICENSE)，图标 URL 沿用其原始 SVG，未改动图形。功能对照与主动变更见 [功能矩阵](docs/feature-matrix.md)。本项目使用 [MIT License](LICENSE)。感谢原作者与其全部上游规则、图标和内核项目。

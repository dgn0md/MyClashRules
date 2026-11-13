# Apple 分流依据与边界

核对日期：2026-11-13。域名分流发生在加密连接外层，不解密 HTTPS，不读取用户请求内容。优先级见脚本末尾 `finalizeMyClashRules`；这些例外先于广告、Apple 国内、QUIC 和通用服务规则。

| 功能                             | 依据                                                                                                                                                                                                                          | 实现与边界                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PCC / Intelligence Extensions    | [Apple 企业网络清单](https://support.apple.com/en-us/101555#aisirisearch)                                                                                                                                                     | 精确匹配 `apple-relay.cloudflare.com`、`apple-relay.fastly-edge.com`、`cp4.cloudflare.com`、`apple-relay.apple.com`；不匹配整个 CDN 域名。UDP 443 不被后续 QUIC 开关提前拒绝         |
| Siri / 搜索                      | 同上                                                                                                                                                                                                                          | `guzzoni.apple.com`、`smoot.apple.com` 及子域。后者同时服务 Siri、Spotlight、Safari、News 等，因此无法仅凭域名拆分这些搜索请求                                                       |
| Siri 观察到的 API | 用户在 Siri 请求中观察到 `api-siri-prod.apple.com`；[社区规则原文](https://gist.github.com/byodian/1850cec35f46197d79e8bd1583c0f4bc) 也将其归入 Siri。Apple 官方企业网络清单尚未单列，具体职责未获官方确认 | 精确匹配到 `Siri`，DNS 同步经该组 DoH，优先于广告、Apple 国内与 QUIC 规则；随 `Siri` 开关启停，不扩展到子域或整个 Apple。补齐路由不代表已验证 Siri 恢复可用 |
| Siri 相关共享 iCloud 接口 | 用户观察到 Siri 失败期间访问 gateway、edge 与地区根域；[Apple 企业网络清单](https://support.apple.com/en-us/101555) 将其列为 CloudKit/iCloud 服务，未认定为 AI 专用；用户选择整体代理国际内容域 | `Apple智能` 精确覆盖 `gateway.icloud.com`，并通过 `DOMAIN-SUFFIX,icloud-content.com` 覆盖内容域本身及所有子域。DNS 使用 `+.icloud-content.com` 经该组 DoH，不匹配 `.com.cn`。普通照片/文件/备份等国际内容也可能代理，无法按产品拆分；不覆盖整个 `icloud.com` 或 gateway 子域，也不证明 Siri 失败原因 |
| News                             | [DLC Apple 分类](https://github.com/v2fly/domain-list-community/blob/master/data/apple)、[AppleNews 规则维护者](https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Clash/AppleNews)                             | 专用 API 与 `apple.news` 等内容入口；出版商网页仍按各自规则。新增端点采用小范围补充，不使用 `news` 关键字或全部新闻站点聚合                                                          |
| News 地区判断                    | [AppleNews 维护说明](https://github.com/blackmatrix7/ios_rule_script/blob/master/rule/Clash/AppleNews/README.md)、[DLC Intelligence 注记](https://github.com/v2fly/domain-list-community/blob/master/data/apple-intelligence) | `gspe1-ssl.ls.apple.com` 单独开关。共享地区判断可能影响地图、eSIM、Watch 与运营商相关功能，不把它伪装成无副作用的 AI 端点                                                            |
| TV / TV+                         | [DLC TV+ 分类](https://github.com/v2fly/domain-list-community/blob/master/data/apple-tvplus)、[Bett Rules](https://github.com/appshubcc/bett-rules)                                                                           | 维护小范围显式规则并每日加载 `apple-tvplus.mrs`，覆盖播放和 UTS API。`np-edge` / `play-edge` 与其他媒体共享，开启该组可能让部分其他媒体也代理                                        |
| Fitness+ / Sports / Books        | [Apple 媒体服务地区表](https://support.apple.com/en-us/118205)                                                                                                                                                                | 仅其产品专用 `fitness.apple.com`、`sports.apple.com`、`books.apple.com` 域。**专用域名不等于完整产品后端**；共享 iTunes API、授权与视频域名由媒体开关决定，不凭猜测补造大量 API 域名 |
| Private Relay                    | [Apple 企业网络清单](https://support.apple.com/en-us/101555)、[Private Relay 机制](https://support.apple.com/en-us/102602)                                                                                                    | 三个 `mask` 入口独立分组，默认关闭该代理例外；Apple 的中继可能承载大量 Safari 流量。该组和 Apple Intelligence PCC 是不同流量                                                         |
| Arcade / 海外购买 / 其他共享媒体 | [Apple 媒体服务地区表](https://support.apple.com/en-us/118205)、[DLC iTunes 分类](https://github.com/v2fly/domain-list-community/blob/master/data/itunes)                                                                     | 没有独占域名的流量无法在不解密的前提下保证按产品区分。`Apple海外媒体` 只提供显式、可关闭的共享接口出口；不把整个 App Store 或 Music 一并强制代理                                     |
| 资源下载                         | [Apple 软件与内容端点](https://support.apple.com/en-us/101555)                                                                                                                                                                | `gdmf`、`mesu`、`updates.cdn-apple.com`、`assets.cdn-apple.com` 作为共享系统/资源 CDN 默认直连；不是仅含 AI 模型的专属域名                                                           |

大陆是否提供某个产品以 Apple 当前地区清单为准。Apple Music 与 Classical 等已在大陆提供的服务不因“Apple 海外服务”而默认整体代理。路由配置不会改变 Apple 账号地区、设备资格、内容授权、SIM、系统语言或 GPS 位置，不能保证仅修改 IP 即可开通产品。

默认优先美国是网络出口选择，不是对节点“可解锁”的自动认证。脚本缺少美国节点时回到默认代理；静态配置美国组为空时 `REJECT`，需要用户改选实际拥有的受支持地区。可手选家宽节点或稳定的自建落地，避免随负载均衡更换 IP。

Apple 官方指出某些端点并不支持普通 HTTP 网页代理。TUN 转发 TCP/UDP 与 HTTPS MITM 是不同机制；本项目不实施 MITM。使用 iOS/macOS 客户端时，TUN/Network Extension 的权限与流量覆盖由客户端实现负责。

国际内容域使用 Mihomo 标准 [DOMAIN-SUFFIX 路由规则](https://wiki.metacubex.one/config/rules/) 和 [DNS 域名通配符](https://wiki.metacubex.one/handbook/syntax/)。`+.icloud-content.com` 覆盖根域与全部子域，范围与 `DOMAIN-SUFFIX,icloud-content.com` 一致。之前只匹配 edge 的正则遗漏 `ussjc1.icloud-content.com`，按用户最新选择改为整个国际内容域；无需再猜测主机命名结构。

### 国际内容域与中国站的区别

2026-11-13 通过证书验证的 Google DoH 实际查询（固定 IP 连接，未用明文 DNS）核实：

| 输入主机 | Apple DNS 返回的 CNAME | 当前分流例外 |
| --- | --- | --- |
| `edge-013.hkhkg2.icloud-content.com` | `edge-013.hkhkg2.ce.apple-dns.net` | 命中 `Apple智能` |
| `ussjc1.icloud-content.com` | `ussjc1.ce.apple-dns.net` | 命中 `Apple智能` |
| `hkhkg2.icloud-content.com` | `hkhkg2.ce.apple-dns.net` | 命中 `Apple智能` |
| `sgsin8.icloud-content.com` | `sgsin8.ce.apple-dns.net` | 命中 `Apple智能` |
| `edge-051.xactu3.icloud-content.com.cn` | `edge-051.xactu3.ce.apple-dns.cn` | 不命中，继续原规则 |
| `xactu3.icloud-content.com.cn` | `xactu3.ce.apple-dns.cn` | 不命中，继续原规则 |
| `gateway.icloud.com.cn` | `gateway.fe.apple-dns.cn` | 不命中，继续原规则 |

可复核 [ussjc1 DNS 查询](https://dns.google/resolve?name=ussjc1.icloud-content.com&type=A)、[国际 edge](https://dns.google/resolve?name=edge-013.hkhkg2.icloud-content.com&type=A)、[中国站根域](https://dns.google/resolve?name=xactu3.icloud-content.com.cn&type=A)、[中国站 edge](https://dns.google/resolve?name=edge-051.xactu3.icloud-content.com.cn&type=A)、[中国站 gateway](https://dns.google/resolve?name=gateway.icloud.com.cn&type=A)；结果随时间/解析位置变化。中国站实测标签是 `xactu3`，不能只排除假定的 `cn` 地区前缀。

这里的“非 CN”按国际域名命名空间定义，并非 GEOIP 非 CN 检查，不是完整大陆机房清单。即使国际域名以后解析到大陆 IP，仍会按域名规则代理；`.com.cn` 继续原规则，也不保证任意用户设置下都直连。真实 Siri 可用性和运营商网络仍需设备侧验证。

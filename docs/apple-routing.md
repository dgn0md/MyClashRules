# Apple 分流依据与边界

核对日期：2026-11-13。域名分流发生在加密连接外层，不解密 HTTPS，不读取用户请求内容。优先级见脚本末尾 `finalizeMyClashRules`；这些例外先于广告、Apple 国内、QUIC 和通用服务规则。

| 功能                             | 依据                                                                                                                                                                                                                          | 实现与边界                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PCC / Intelligence Extensions    | [Apple 企业网络清单](https://support.apple.com/en-us/101555#aisirisearch)                                                                                                                                                     | 精确匹配 `apple-relay.cloudflare.com`、`apple-relay.fastly-edge.com`、`cp4.cloudflare.com`、`apple-relay.apple.com`；不匹配整个 CDN 域名。UDP 443 不被后续 QUIC 开关提前拒绝         |
| Siri / 搜索                      | 同上                                                                                                                                                                                                                          | `guzzoni.apple.com`、`smoot.apple.com` 及子域。后者同时服务 Siri、Spotlight、Safari、News 等，因此无法仅凭域名拆分这些搜索请求                                                       |
| Siri 相关共享 iCloud 接口       | 用户观察到 Siri 失败期间访问 gateway 与 edge 主机；[Apple 企业网络清单](https://support.apple.com/en-us/101555) 将其列为 CloudKit / iCloud 服务，未认定为 AI 专用；跨编号/地区覆盖是本项目的命名模式推断 | `Apple智能` 精确覆盖 `gateway.icloud.com`，内联 classical 集合 `apple_ai_edge` 用 `^edge-[0-9]+\.[a-z0-9-]+\.icloud-content\.com$` 覆盖所有数字编号和单层地区标签；路由及 DNS 的 `rule-set:apple_ai_edge` 共用同一正则，DNS 经该组 DoH。符合该结构的普通 iCloud 内容也会代理，不能仅凭域名区分 Siri 与照片/文件；不扩展整个内容域、地区后缀或 gateway 子域。仅凭访问记录不能证明 Siri 失败原因 |
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

edge 模式要求客户端内核支持 `DOMAIN-REGEX`、inline classical 规则集及 DNS 引用该集合，语法依据为 [Mihomo 路由规则](https://wiki.metacubex.one/config/rules/)、[规则集合](https://wiki.metacubex.one/config/rule-providers/) 和 [DNS 配置](https://wiki.metacubex.one/config/dns/)。不能把路由的 `edge-*.*` 写法直接当作 DNS 中等价的通配符；本项目通过共用集合保持两者范围一致。命名结构若改变，仍需重新评估模式。

### 国际 edge 与中国站的区别

2026-11-13 通过证书验证的 Google DoH 实际查询（固定 IP 连接，未用明文 DNS）核实：

| 输入主机 | Apple DNS 返回的 CNAME | 本项目 edge 例外 |
| --- | --- | --- |
| `edge-013.hkhkg2.icloud-content.com` | `edge-013.hkhkg2.ce.apple-dns.net` | 命中 `Apple智能` |
| `edge-051.xactu3.icloud-content.com.cn` | `edge-051.xactu3.ce.apple-dns.cn` | 不命中，继续原有 Apple/国内规则 |
| `gateway.icloud.com.cn` | `gateway.fe.apple-dns.cn` | 不命中，继续原有 Apple/国内规则 |

可用 [国际 edge DNS 查询](https://dns.google/resolve?name=edge-013.hkhkg2.icloud-content.com&type=A)、[中国站 edge DNS 查询](https://dns.google/resolve?name=edge-051.xactu3.icloud-content.com.cn&type=A)、[中国站 gateway DNS 查询](https://dns.google/resolve?name=gateway.icloud.com.cn&type=A) 复核；结果会随时间和解析位置变化。中国站 edge 的实测标签是 `xactu3`，因此不能只排除假定的 `cn` 地区前缀。当前以正则末尾 `.icloud-content.com$` 排除 `.icloud-content.com.cn`；这表示国际域名命名空间，不是 GEOIP 非 CN 检查，也不是完整大陆机房清单。若未来出现同一国际域名由大陆 IP 承载，仍会按该域名规则代理。

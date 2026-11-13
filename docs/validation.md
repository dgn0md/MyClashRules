# 验证记录与部署验收

日期：2026-11-13（Asia/Singapore）。这些记录只覆盖这里列出的检查范围，不等于大陆运营商、真实机场或 Apple 产品开通实测。

## 可复现的代码检查

- `npm test`：93 项继承回归/ES2026/QuickJS 检查、19 组新增检查通过。新增开关矩阵逐个反转全部布尔选项，并检查静态 provider 与展开订阅两种输出的引用、循环、DNS 与生成行为。
- `npm run check`：发布的默认 YAML 与当前脚本生成结果完全一致。
- `git diff --check`：无空白错误。
- 依赖安装审计：0 个已报告漏洞；YAML 使用修复深度嵌套问题的 2.9.1。

继承测试有明确的兼容模式设置；严格默认与新增 Apple 功能由新测试独立覆盖。QuickJS 实际运行当前默认 `main()`，不是只检查语法。

## 真实 Mihomo 内核

使用官方 **Mihomo v1.19.34 darwin arm64**：

```text
https://github.com/MetaCubeX/mihomo/releases/download/v1.19.34/mihomo-darwin-arm64-v1.19.34.gz
SHA-256 (gzip): 1a7a20eca63fbbaec90137717465bfde488d0db2a3a79b8fadebf9b2545b6e4c
```

```sh
node tools/download-rules.js .local/rules
node tools/native-check.js /path/to/mihomo .local/rules
```

- 原生 `-t` 检查：默认、所有单选项反转、双倍率过滤、展开订阅、自定义链式共 **63** 种配置（含域名嗅探开关）。
- **46** 个实际使用的公开 MRS 文件均下载成功，并在启动的内核中解析到非零条目；下载仅凭压缩头不算语义验收，运行检查进一步验证了加载。公开来源、大小与摘要见 [规则清单](validation/rules.json)。
- 回环运行检查：地区/倍率/家宽 provider 过滤、普通 Apple/微软默认直连与 Apple News/智能默认美国。
- **25** 个 HTTP CONNECT 请求在内核真实规则下执行，查询 `/connections` 确认实际命中组；见 [路由结果](validation/routes.json)。包括 PCC、Siri、News、TV、Fitness/Sports/Books 专用入口、模型 CDN、普通 Apple/微软、国内域名、YouTube/GitHub/Steam。

运行环境只使用临时目录和回环监听器，TUN、系统路由、NTP 与 DNS 监听被关闭。SOCKS 模拟节点将任何请求终止到本地测试服务器，不访问目标服务。此测试证明路由选择和 MRS 加载，不证明 Apple 对账号/设备授权，不证明 TUN 的系统覆盖。

GitHub CI 使用同版本 Linux 二进制并核验官方发行摘要；新建 workflow 尚需在远程推送后才能获得 GitHub Actions 的实际结果，不能将本机通过写成远程 CI 已绿。

## 纯 IP 入站的域名嗅探回归

默认开启 `域名嗅探`，配置 HTTP/TLS/QUIC 识别和 `parse-pure-ip: true`，并用 `override-destination: false` 保留原始目标地址。脚本与生成 YAML 使用同一开关，关闭后不依赖嗅探恢复域名。

`tools/native-sniffing.js` 已在 Mihomo v1.19.34 中验证 **7** 个真实回环请求：

- 关闭嗅探：以纯 IP 入站、携带 `github.com` TLS SNI，命中 `microsoft_ip` / `Microsoft`，复现此前域名缺失时的归类机制。
- 开启嗅探：同一请求恢复 `github.com`，命中 `github` / `GitHub`；另外覆盖 HTTP Host 与 IPv6 目标地址。
- Siri 的 `api-siri-prod.apple.com` 和 Apple AI 的 `apple-relay.apple.com` 按恢复的 TLS 域名命中各自专用组；普通 Microsoft 域名仍命中 Microsoft 组。

测试使用真实 TLS ClientHello，不完成远端握手，也不跳过证书校验。所有测试组（包括原本直连的组）均替换为回环 SOCKS 模拟出口，避免缺陷复现时向外网 IP 发包；生产规则顺序和域名嗅探配置保持原样，并断言目标 IP 没有被改写。证据仅写入临时目录的 `sniffing.json`。QUIC 配置已通过原生解析，但本次未生成 QUIC 流量验证；没有可见域名的握手仍可能落入 IP 规则。这些结果不等同于用户设备、运营商或 Siri 服务实测。

## 国际 iCloud 内容域回归

`tools/native-check.js` 验证国际 `icloud-content.com` 根域及各层子域命中 `Apple智能`，覆盖地区根域、edge、非标准编号和其他内容主机。中国站 `icloud-content.com.cn`、`xactu3.icloud-content.com.cn`、`gateway.icloud.com.cn` 以及伪造的后缀延长域名不命中该例外。测试包含合成主机，不声称它们真实存在。

DNS 检查保留生成配置的 policy 键，仅在隔离测试中把上游替换为内核内置的本地 RCODE 响应，区分匹配/未匹配，验证 A 与 AAAA；不询问系统 DNS，不产生外网 DNS 请求。生产配置仍使用 DoH。该检查验证路由和 DNS 后缀范围一致，不是 Siri 或运营商网络实测。

## DoH 端点检查

```sh
node tools/check-doh.js
```

当前执行网络对 `https://223.5.5.5/dns-query` 与 `https://1.12.12.12/dns-query` 的请求均得到有效 DNS 响应，TLS 证书验证通过。工具直接访问 HTTPS IP、没有 UDP DNS 或明文回退。本检查只证明检查时当前网络的端点可用性，不能代表全部大陆电信/联通/移动线路，也没有验证用户实际代理出口到境外 DoH 的连通性。

## 用户网络验收

1. 导入自己的订阅，使用脚本或展开模式生成；关闭客户端额外 DNS 覆写，开启 TUN。先检查严格模式没有私有 DNS 冲突，再启动。
2. 清理系统/浏览器 DNS 与客户端 Fake-IP 缓存，分别用 IPv4 与 IPv6 测试国内域名、境外域名、节点域名和 Apple 专用域名。代理模式应为 `rule`。
3. 在真实外网接口抓取 **UDP/TCP 53**：正常公网解析不应出现上游明文查询；不要把回环/本机 TUN 上已被接管的请求误判成外泄。macOS 可先用 `route get default` 查看接口，再在该接口抓包：

   ```sh
   sudo tcpdump -ni en0 'port 53 and (udp or tcp)'
   ```

   将 `en0` 换成真实外网接口；多网卡/IPv6 场景需覆盖所有出口。检查 TUN/代理关闭时的对照样本，避免因 DNS 缓存而得到假阴性。

4. 在代理连接日志核对 `Apple智能` / `Siri` / `AppleNews` / `AppleTV`、普通 Apple 直连与两个 DNS 出口。AI/News/TV 的出口与账号受支持地区应一致；缺少美国节点时手动改选。
5. 临时阻断两个 DoH 地址，再次查询未缓存域名。预期失败，外网接口仍不出现 UDP/TCP 53；恢复网络后重试。不要为了“能打开”添加明文 DNS。
6. 在 Windows 多网卡、其他 VPN、移动蜂窝/Wi-Fi 切换、睡眠唤醒后重复。任何未进入 TUN/网关的设备或接口都不能由本配置单独保证接管。
7. 检查 Siri、News、TV 的真实账号可用性与共享接口影响。若关闭 `Apple地区检测` 后 News 不可用，应结合地图/eSIM/Watch 的需求选择，而不是无条件扩大代理范围。

## 尚未取得的环境证据

没有你的真实订阅、出口节点、Apple 设备与大陆运营商抓包，因此不报告服务解锁成功率、全设备零旁路或代理字节节省百分比。实现层面的开关、DNS 上游、路由顺序、生成一致性与真实内核选择已经单独验收。

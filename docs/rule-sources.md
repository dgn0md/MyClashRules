# 动态规则源评估

核对日期：2026-11-13。比较的是维护者公开的数据处理、分组与分发格式；没有大陆运营商流量标注集，不能从项目名、星标或规则数量推断准确率。

| 候选                                                                            | 原始证据                                                                                                                                                                                 | 与需求的关系                                                                                                   | 选择                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [Bett Rules](https://github.com/appshubcc/bett-rules)                           | [README](https://github.com/appshubcc/bett-rules/blob/master/README.md)：每日同步，CN DNS 校验、海外库去除国内子域、服务 IP 去除大陆地址、MRS 细分                                       | 与 MyClash 原算法、`path-in-bundle`、全量服务分类匹配；CN 域名做 DNS、优化 CN IP 做路由兜底                    | 默认延续；补充独立 Apple 端点和 TV 动态子集 |
| [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)         | [README](https://github.com/MetaCubeX/meta-rules-dat/blob/master/README.md)：MRS、多种 geodata，CN 源为 ChinaMax_Domain                                                                  | 维护活跃且适合 Mihomo；广义 CN 库不直接等价于安全直连清单，不能证明替换后更省流量                              | 作为对照；不盲目替换全部 provider           |
| [Loyalsoldier/clash-rules](https://github.com/Loyalsoldier/clash-rules)         | [README](https://github.com/Loyalsoldier/clash-rules/blob/master/README.md)：每日构建 direct/proxy/reject 等集合、公开数据来源                                                           | 集合清晰；整体 direct 库替换无法保留全部细分与 DNS/IP 协同设计                                                 | 不整体覆盖                                  |
| [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) | [AppleNews](https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Clash/AppleNews)、[AppleTV](https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Clash/AppleTV) | 适合核对小产品端点及已知副作用；部分规则含进程或共享地区接口，需要区分 DNS domain、路由 classical 与客户端条件 | 作为端点证据，不直接叠加全部分类            |
| [SukkaW/Surge](https://github.com/SukkaW/Surge) | [Apple China Special Domains 固定版本](https://github.com/SukkaW/Surge/blob/0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf)：9 条大陆专用主机规则，不含已观察到的 `bag.itunes.apple.com`、`fpinit.itunes.apple.com`、`gspe35-ssl.ls.apple.com`、`smp-device-content.apple.com` | 用于缩窄 Apple CN 直连范围，方便在客户端切换 `Apple` 组诊断；不是按实时解析 IP 判断服务器地区 | 取代 `apple@cn` 作为 `apple_cn`；固定版本，待实测后复核 |

## 实际采用的路由算法

1. 53 端口已入内核的流量转内置 DNS。
2. Apple 专用域名/TV 动态规则先行，防止被 Apple 国内库或 QUIC 屏蔽覆盖。
3. 广告规则与上游的国内服务、游戏/下载 CDN 例外。
4. 启用的 AI、YouTube、Telegram、Apple 等服务域名规则。
5. 海外域名默认代理；剩余流量用优化 CN IP 判定直连，再做私网/服务 IP 与最终兜底。

`cn` 库用于 DNS 策略与 Fake-IP 过滤，**不是 `RULE-SET,cn,直连` 的全量白名单**。原作者关于“CN DNS + CN IP 兜底”的设计被保留。没有把未知流量改成默认直连来人为压低代理计数。

## 当前节流改变

- 普通 Apple、微软默认直连，用户仍能在组内改选代理。Siri 排查时，`apple_cn` 只保留 SukkaW 标记的大陆专用主机；其余命中 `apple` / `apple_ip` 的流量可通过 `Apple` 组手动改选代理。`cn_ip` 仍先于 `apple_ip`，此实验不等于 Apple 服务地区实测。
- Apple AI/News/TV 等只选专用端点，模型/共享资源下载默认直连。
- 高/低倍率、家宽、自建和链式组保持可选；Private Relay 与共享海外媒体默认不开启代理例外。
- 只保留路由或 DNS 实际引用的 provider；依赖扫描同时覆盖两者，防止删除只供 DNS 用的 `cn`、`douyin`、`fakeip_filter`。
- 动态资源每天刷新，缓存路径不混淆 domain / ipcidr；下载失败保持内核正常的缓存/失败行为，不切换到明文 DNS。

真实流量节省比例须用同一订阅、同一任务序列、冷/热缓存分别采样。建议统计按策略组的字节、误代理域名与必要服务失败；不能只看“直连命中次数”就声称更精准。

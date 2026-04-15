# Chrome 商店上架与商业化方案

更新时间：2026-04-14 16:31:17（Asia/Shanghai）

## 目标

本文档用于回答下面这个核心问题：

- 当前 `immersive-input-chrome` 项目如果希望上架 Chrome Web Store，面向大多数普通用户安装使用，并进一步商业化，应该如何调整产品形态、技术架构和发布策略。

## 当前项目现状

当前仓库的公开扩展形态，不适合直接原样上架并大规模推广。主要原因不是功能不足，而是：

- 权限面过大
- 产品单一用途不够聚焦
- 依赖本地 `nativeMessaging` 和本地 HTTP 服务
- 普通用户安装和理解成本高
- 商店审核成本高，转化率也会偏低

当前代码中的几个关键信号如下：

- 扩展清单同时申请了 `nativeMessaging`、`<all_urls>`、`debugger`、`history`、`bookmarks`、`webRequest`、`declarativeNetRequest` 等权限，见 `app/chrome-extension/wxt.config.ts`
- 后台启动后会主动连接 Native Host，见 `app/chrome-extension/entrypoints/background/native-host.ts`
- Sidepanel 的 Agent 能力依赖本地 `127.0.0.1` 服务，见 `app/chrome-extension/entrypoints/sidepanel/composables/useAgentServer.ts`
- 本地服务同时暴露 `/agent/*` 与 `/mcp`，见 `app/native-server/src/server/index.ts`

这意味着当前项目本质上是：

- 一个浏览器扩展
- 一个 Native Messaging Host
- 一个本地 HTTP/MCP 服务
- 一个本地 Agent 调度层

这套设计适合高级用户、本地自动化、MCP 玩家、企业内网场景，但不适合直接面向“大多数商店用户”。

## 核心判断

如果目标是上架 Chrome 商店并商业化，应优先采用“双产品形态”：

1. `Chrome 商店版`
2. `桌面桥接版 / 高级版 / 企业版`

推荐定义如下：

### Chrome 商店版

面向普通用户，纯扩展 + 云端服务。

特点：

- 不依赖 `nativeMessaging`
- 不依赖本地 `127.0.0.1:12306`
- 权限收敛到最小必要集合
- 单一用途清晰
- 更容易通过审核
- 更适合订阅制商业化

### 桌面桥接版 / 企业版

面向高级用户和企业，保留 Native Host、本地 MCP、本机 Chrome 深度控制能力。

特点：

- 保留 `nativeMessaging`
- 保留本地 Agent / MCP / 文件桥接
- 支持控制用户本机浏览器上下文、登录态、标签页和高级自动化
- 安装门槛更高，但适合高价值用户

## 为什么不建议直接原样上架

### 1. 权限过宽

当前 manifest 中的权限组合会显著增加审核压力：

- `nativeMessaging`
- `debugger`
- `webRequest`
- `history`
- `bookmarks`
- `declarativeNetRequest`
- `host_permissions: <all_urls>`

这并不代表一定无法上架，但会带来几个问题：

- 审核人员更难快速理解“单一用途”
- 用户安装页权限警告更重
- 商店 listing 的转化率会更低
- 需要更完整的权限说明、隐私披露和测试说明

### 2. 产品用途过于混合

当前项目同时覆盖：

- MCP Server
- 浏览器自动化
- 网页编辑
- 元素标注
- 语义搜索
- 网络调试
- 浏览记录分析
- 书签管理
- Agent 会话
- 工作流录制与回放

从工程角度这是优势，但从商店审核角度，这容易被视为“单一用途不够聚焦”。

### 3. 本地桥接不适合大众分发

当前用户要完整使用高级功能，往往还需要：

- 安装 Node.js
- 安装 `mcp-chrome-bridge`
- 注册 Native Messaging Host
- 理解本地端口和服务状态

这套流程对技术用户友好，但对大多数 Chrome 商店用户并不友好。

## 推荐的产品定义

### 推荐主产品：AI 网页助手

如果要做商店主产品，建议将产品定位收敛为：

- 当前网页智能助手
- 网页内容理解与操作助手
- AI 辅助浏览与轻量自动化工具

商店版建议聚焦这些能力：

- 当前页摘要
- 页面元素识别
- 当前页智能操作
- 选中内容解释/翻译/改写
- 轻量网页辅助交互
- 用户显式触发的任务流

不建议在第一版商店产品中直接主推：

- 本地 MCP Server
- Native Host
- 本地文件操作桥
- 全浏览器历史深度分析
- 高权限网络抓包
- Debugger 深度控制

这些能力更适合作为：

- Pro 功能
- 桌面桥接版
- 企业版

## 推荐架构

### 方案 A：最推荐

商店版采用：

- Chrome Extension
- 云端 API
- 云端 Agent / 会话服务
- 云端账号系统
- 云端计费系统

本地不保留 Native Host 依赖。

#### 前端扩展负责

- Popup / Sidepanel / Options UI
- 当前页元素采集
- 用户显式授权后的页面交互
- 把任务发往云端
- 展示执行结果

#### 云端负责

- 登录与鉴权
- 用户信息与订阅状态
- AI 模型路由
- Agent 会话与任务编排
- 工作流存储
- 使用量统计
- 计费与配额

### 方案 B：高级版补充

保留当前本地形态，做一个更高阶的桌面桥接版：

- Chrome 扩展继续存在
- Native Host 保留
- 本地 MCP 保留
- 本地 Agent 保留
- 可选再接云端控制面

它不应作为大众用户的首发版本，而应作为：

- 高级订阅附加功能
- 独立下载的 companion app
- 企业版部署包

## 云端化建议

如果你要把“本地那部分”迁到云端，建议这样拆：

### 可以上云的部分

- 用户系统
- 会话系统
- Agent 编排
- AI 模型调用
- 任务记录
- 工作流定义
- 订阅与计费
- MCP 对外入口

### 不应强行完全上云的部分

如果仍然要控制“用户自己这台电脑上的 Chrome”，这些能力无法彻底脱离本地：

- 当前已登录的浏览器上下文
- 用户本机标签页状态
- 本机 Cookie / Session 上下文
- 依赖扩展和本地浏览器环境的即时控制

所以需要做架构区分：

- 商店版：云优先，不依赖本地桥
- 高级版：云端控制面 + 薄本地桥

## 权限重构建议

### 商店版建议保留的最小权限

视第一版功能而定，优先保留：

- `storage`
- `activeTab`
- `scripting`
- `tabs`
- `sidePanel`
- `contextMenus`

### 商店版建议谨慎处理的权限

这些权限不要在第一版默认申请，除非你明确把它们变成核心卖点并能充分解释：

- `debugger`
- `webRequest`
- `history`
- `bookmarks`
- `downloads`
- `declarativeNetRequest`
- `nativeMessaging`

### Host 权限建议

不要在商店版默认使用：

- `host_permissions: ["<all_urls>"]`

更推荐：

- 用 `optional_host_permissions`
- 在用户进入特定站点时再申请授权
- 或以“当前标签页单次授权”为主

## 商业化方案

### 推荐模式：免费安装 + SaaS 订阅

Chrome 商店本身不应作为主要支付平台。更合理的路径是：

- 用户从 Chrome 商店免费安装扩展
- 用户在你的官网注册账号并订阅
- 扩展登录后从云端获取 entitlement
- 不同订阅层级解锁不同能力

### 建议的套餐结构

#### Free

- 当前页摘要
- 基础 AI 助手
- 每月有限额度
- 基础站点授权

#### Pro

- 更多 AI 调用额度
- 跨页面任务
- 工作流保存
- 高级页面操作
- 云端历史任务记录

#### Team

- 团队共享工作流
- 成员管理
- 配额管理
- 操作审计

#### Enterprise / Desktop Add-on

- Native Host
- 本地 MCP
- 本机浏览器深度控制
- 企业内部部署
- 更高的数据隔离和审计要求

### 支付平台建议

如果你要做国际化商业化：

- `Stripe Billing`：适合你自己掌控订阅逻辑和后台
- `Paddle Billing`：更适合把税务和订阅合规一起外包

如果你先做中文市场，也可以先接：

- 国内支付 + 自建订阅后台

但长期看，若目标是全球用户，建议优先考虑 `Stripe` 或 `Paddle`。

## 上架审核准备

### 1. 单一用途描述

在 Chrome Web Store 的 single purpose 字段里，必须把产品说清楚。

建议不要写成：

- 浏览器万能自动化平台
- MCP + Agent + 调试 + 书签 + 历史 + 工作流中心

建议写成：

- AI 网页助手，帮助用户理解当前网页内容并在授权站点上执行轻量交互操作

### 2. 权限说明

每一个权限都要能回答：

- 为什么必须要这个权限
- 对用户具体有什么价值
- 是否有更窄的替代权限

### 3. 隐私政策

必须准备独立页面，至少说明：

- 收集哪些数据
- 为什么收集
- 是否发给 AI 服务商
- 是否用于训练
- 是否与第三方共享
- 用户如何删除数据
- 联系方式

### 4. 测试说明

由于你的项目包含较复杂行为，建议为审核人员准备：

- 测试账号
- 测试路径
- 核心功能操作步骤
- 权限触发说明
- 不依赖本地 host 的演示流程

## 推荐的分阶段路线图

### 阶段 1：做商店版最小可发布产品

目标：

- 去掉对 `nativeMessaging` 和 `localhost` 的强依赖
- 收敛单一用途
- 收敛权限
- 能通过审核并跑通基础订阅闭环

输出：

- 商店版扩展
- 云端 API
- 登录系统
- 订阅判断
- 基础隐私政策与官网

### 阶段 2：补全云端 Agent

目标：

- 把当前侧边栏里依赖本地服务的 Agent 能力迁到云端

输出：

- 云端会话服务
- 云端任务流
- 云端模型编排
- 前端状态同步

### 阶段 3：推出高级桌面桥接版

目标：

- 为高级用户保留本地 MCP / Native Host 深度能力

输出：

- companion installer
- 桌面桥接引导
- 本地 bridge 健康检查
- 高级版订阅开关

## 对当前仓库的直接建议

### 建议一：拆出两个发布目标

建议新增两个构建形态：

- `web-store`
- `desktop-bridge`

其中：

- `web-store` 去掉 `nativeMessaging`、`localhost` Agent 依赖和高风险权限
- `desktop-bridge` 保留当前高级功能

### 建议二：抽象 Agent 传输层

当前 sidepanel 直接请求：

- `http://127.0.0.1:${port}/agent/engines`
- `http://127.0.0.1:${port}/agent/chat/.../stream`

建议抽象成统一 transport：

- `LocalAgentTransport`
- `CloudAgentTransport`

这样同一套 UI 可以同时支持：

- 商店云端版
- 桌面本地版

### 建议三：把后台能力分层

建议将后台能力分为：

- `core`：商店版基础能力
- `advanced`：需要高权限或本地桥的能力

第一阶段商店版只启用 `core`。

## 建议的下一步实施顺序

1. 先拆 manifest，定义 `web-store` 版权限集
2. 把 sidepanel 的 Agent 请求从本地 `127.0.0.1` 抽象成可切换 transport
3. 定义云端 API 接口与登录态
4. 上线官网、隐私政策、定价页
5. 准备首版 Chrome Web Store listing 和审核测试说明
6. 再做桌面桥接版和高级能力订阅

## 推荐结论

最终建议如下：

- 不要把当前项目原样直接作为大众版上架
- 先做“纯扩展 + 云端服务”的 Chrome 商店版
- 保留“Native Host + 本地 MCP”作为高级版或企业版
- 商业化采用“免费安装 + 官网订阅 + 扩展登录鉴权”
- 第一优先级是收敛权限、明确单一用途、去掉商店版对本地桥的依赖

## 参考资料

- Chrome Web Store Program Policies  
  <https://developer.chrome.com/docs/webstore/program-policies/policies>
- Chrome Web Store Quality Guidelines  
  <https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines>
- Chrome Web Store Quality Guidelines FAQ  
  <https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq>
- Fill out the privacy fields  
  <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- Native messaging  
  <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- Cross-origin network requests  
  <https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- Chrome Web Store payments deprecation  
  <https://developer.chrome.com/docs/webstore/cws-payments-deprecation/>
- Stripe Billing  
  <https://docs.stripe.com/billing/subscriptions>
- Paddle Billing  
  <https://developer.paddle.com/build/subscriptions/overview>


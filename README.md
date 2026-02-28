## Auto Calendar

将用户自然语言解析为结构化日程，并生成可订阅的 `.ics` 链接。

当前实现特性：

- 使用 Gemini 免费 API 解析自然语言。
- 只保存结构化结果，不保存原始输入文本。
- 不提供客户端直写事件接口（没有 `POST /events`）。
- 提供 token 订阅地址：`GET /api/calendar/:token.ics`。
- 支持 `RRULE` 与全天事件。
- ICS 头部包含 `X-PUBLISHED-TTL: PT15M`，时区统一 `Asia/Shanghai`。
- 一键部署面向 Vercel。

## API 说明

### 1) 解析并入库（结构化）

`POST /api/parse`

请求体：

```json
{
	"userId": "user_001",
	"text": "下周三下午两点在瑞幸咖啡和老王开会一小时",
	"timezone": "Asia/Shanghai"
}
```

响应：

```json
{
	"event": {
		"id": "uuid",
		"userId": "user_001",
		"summary": "和老王开会",
		"startTime": "2026-03-04T06:00:00.000Z",
		"endTime": "2026-03-04T07:00:00.000Z",
		"description": "",
		"location": "瑞幸咖啡",
		"isAllDay": false,
		"rrule": "",
		"createdAt": "...",
		"updatedAt": "..."
	},
	"token": "subscription_token",
	"subscriptionUrl": "/api/calendar/subscription_token.ics"
}
```

### 2) 订阅链接

`GET /api/calendar/:token.ics`

- 返回 `text/calendar; charset=utf-8`
- `Cache-Control: no-cache`
- `X-PUBLISHED-TTL: PT15M`
- 空日程返回空 `VCALENDAR`（200）

> 浏览器直接访问通常会下载 `.ics` 文件，这是预期行为。

## 存储策略

- 统一使用 `@vercel/kv` 作为数据库存储
- 不再使用本地 JSON 文件存储

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

复制 `.env.example` 为 `.env.local`，至少填写：

- `GEMINI_API_KEY`
- `GEMINI_MODEL`（默认 `gemini-2.0-flash`）
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

3. 启动

```bash
npm run dev
```

## 一键部署（Vercel）

点击部署按钮：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yyuneko/auto-calendar)

部署时配置环境变量：

- `GEMINI_API_KEY`
- `GEMINI_MODEL`（可选）
- `KV_REST_API_URL`（必填）
- `KV_REST_API_TOKEN`（必填）

## 权限接入预留

后续接入登录后，应保证：

- 用户仅能修改自己的事件（按 `userId` 强约束）。
- 编辑能力走鉴权会话，不复用订阅 token。
- 不信任客户端传入的 `userId`，以服务端会话身份为准。

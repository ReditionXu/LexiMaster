# AI 接入说明（LexiMaster 3.0）

## 1. 工作方式

```
浏览器 ──POST /api/ai/{task}──▶ LexiMaster 代理（同源 Node 服务）──HTTPS──▶ OpenAI / Anthropic / Gemini / 兼容接口
          {config, payload}        · 校验配置与 Base URL（SSRF 防护）
                                   · 按任务在服务端构建提示词
                                   · 统一适配各家接口、错误映射、超时、限流
```

- 浏览器**不能**发送任意提示词：只有 `test / generate / explain / report` 四种任务，提示词在 `server/ai/prompts.mjs` 里由结构化、限长的字段拼装，代理因此不是开放转发服务。
- 所有 AI 输出在浏览器端经过 `src/ai/validate.ts` 严格校验后才会展示；评分永远由原有的确定性引擎 `grammarEngine.ts` 完成。

## 2. 在应用中配置

右上角 **AI** → 「AI 设置」：

| 项目 | 说明 |
| --- | --- |
| 启用 AI 功能 | 总开关。关闭时不发出任何 AI 请求。 |
| 服务商 | OpenAI / Anthropic Claude / Google Gemini / OpenAI 兼容接口 |
| API Key | 密码框输入。**默认只保存在内存中**，刷新即清除；可勾选「在本标签页中记住」（sessionStorage，关闭标签页清除）。 |
| 模型名称 | 任意 Model ID，以你账号在服务商控制台中可用的为准。 |
| API Base URL | 仅兼容接口需要，必须是公网 `https://`。 |
| 测试连接 | 发出一次极小请求，显示延迟或具体错误（认证失败、模型不存在、限流、超时、地址被拦截…）。 |
| 删除 AI 配置 | 清除 Key、服务商、模型与偏好。 |
| 功能开关 | AI 出题 / AI 解析 / AI 学习分析，可分别关闭。 |
| 解析触发方式 | 答错自动（默认）/ 手动 / 每题。 |
| 每日请求上限 | 50 / 150 / 300 / 600，超出后当日不再发请求。 |
| 每次生成题数 | 2 / 3 / 5。 |

兼容接口示例：DeepSeek `https://api.deepseek.com/v1`、通义千问 `https://dashscope.aliyuncs.com/compatible-mode/v1`、OpenRouter `https://openrouter.ai/api/v1`。

### 服务端托管密钥（可选）

部署者可在服务器环境变量中配置 `AI_PROVIDER / AI_MODEL / AI_API_KEY (/ AI_BASE_URL)`，用户在设置页选择「使用服务端托管密钥」即可，密钥不会下发到浏览器。见 `.env.example`。**不要**使用 `VITE_` 前缀，否则会被打包进前端。

## 3. 接口文档（代理）

所有接口：`Content-Type: application/json`，响应 `Cache-Control: no-store`。

### `GET /api/health`
```json
{ "ok": true, "service": "leximaster-ai-proxy", "serverManaged": { "provider": "openai", "model": "gpt-4o-mini" } | null, "allowPrivateBaseUrl": false }
```

### `POST /api/ai/{task}` —— `task ∈ test | generate | explain | report`
请求体：
```json
{
  "config": { "provider": "openai|anthropic|gemini|openai-compatible", "model": "…", "apiKey": "…", "baseUrl": "https://…", "useServerKey": false },
  "payload": { … 见下 … }
}
```
成功：`{ "content": "<模型原始文本>", "truncated": false, "latencyMs": 812, "model": "…", "provider": "…", "usage": {…} }`
失败：`{ "error": { "code": "…", "message": "…", "retryAfter": 7 } }`

| code | HTTP | 含义 |
| --- | --- | --- |
| invalid_config / bad_request | 400 | 配置或参数不合法 |
| invalid_base_url / blocked_address | 400 | Base URL 不合规，或指向内网 / 回环 / 元数据地址 |
| auth_failed | 401 | Key 无效或无权限 |
| model_not_found | 404 | 模型或接口地址错误 |
| payload_too_large | 413 | 请求体超过 64 KB |
| rate_limited / proxy_rate_limited | 429 | 服务商限流 / 代理限流（含 `retryAfter`） |
| safety_blocked | 422 | 服务商安全策略拦截 |
| upstream_error / network / response_too_large / empty_response | 502 | 上游异常 |
| timeout | 504 | 超时（test 20s / generate 45s / explain 25s / report 45s） |

payload：

- `test`：`{}`
- `generate`：`{ words: [{ wordId, lemma, chineseHint, partOfSpeech?, unitName?, referenceForm? }] (≤ 8), difficulty: easy|medium|hard|mixed, focusInflection: bool, allowExpansion: bool, avoidSentences?: string[] (≤ 30) }`
- `explain`：`{ sentence, chineseHint, lemma, correctAnswer, acceptedAnswers[], userAnswer, verdict: correct|incorrect, feedbackType, grammarNote }`
- `report`：`LearningStats`（`src/ai/learningStats.ts` 计算，≤ 24 KB）

## 4. 安全设计

- **密钥**：不硬编码、不进 `VITE_*` 环境变量、默认不持久化；代理只在转发时使用，不记录、不回显（错误信息会经过 `scrub()` 去除疑似密钥）。跨会话记住密钥需要账号体系 + 服务端加密存储 + 访问控制，本项目未实现，因此不提供该选项。
- **SSRF**（`server/ai/safeFetch.mjs`）：
  - 仅允许 `https://`；拒绝 URL 中的用户名密码、查询参数；拒绝 `localhost`、单标签主机名、`.local / .internal / .lan …`、`metadata.google.internal` 等。
  - **在建立连接时**解析 DNS 并检查所有解析结果，拦截 `10/8、172.16/12、192.168/16、127/8、169.254/16（含 169.254.169.254）、100.64/10、0/8、组播/保留段、::1、fc00::/7（含 fd00:ec2::254）、fe80::/10、IPv4 映射 / NAT64 / 6to4 地址`，可防 DNS 重绑定。
  - 不跟随重定向；响应体上限 2 MB；超时可取消。
  - `LEXIMASTER_ALLOW_PRIVATE_BASE_URL=1` 仅供本地开发（如本机 Ollama、mock 服务），生产环境切勿开启。
- **滥用控制**：代理按 IP 限流（默认 60 次/分钟）；客户端有每日请求上限；出题流对每个词最多请求 2 次，整场练习请求数有硬上限，认证失败等致命错误会立即停止调用并回退到题库。
- **内容安全**：AI 输出必须通过结构与质量校验；AI 解析不能改变评分；学习报告中的词汇/单元 ID 会被过滤为真实存在的 ID。

## 5. AI 出题的校验规则（`validateGenerated`）

一道 AI 题目只有同时满足以下条件才会出现：

1. `wordId` 属于本次请求的目标词；同一词不重复。
2. `lemma` 等于目标词（未授权「扩展词汇」时）。
3. 句子恰好 1 个 `_____`，25–300 字符、6–45 个词，有结束标点，不含中文。
4. `correctAnswer` 是 `lemma` 的词形（规则/不规则屈折、派生、短语首词变化，见 `isFormOf`），且未在句中其他位置出现；原形也不能出现在句中。
5. `chineseHint` 为 ≤16 字的中文、不含英文。
6. `grammarNote`、`explanation` 齐全且长度合规。
7. 与本次已出的题、题库原句均不重复。
8. **确定性自检**：用原有评分引擎评判模型自己给出的每个可接受答案，必须判对。
9. 题目 ID、单元 ID、来源由程序赋值，不采信模型输出。

不通过的词在后续批次中重试 1 次，仍失败则使用该词的题库原题（标注「题库原题」及原因）。

## 6. 部署到 Vercel

项目根目录的 `api/` 即 Vercel Functions，与本地开发、`npm start` 共用同一个 `server/ai/handler.mjs`：

| 文件 | 路由 |
| --- | --- |
| `api/health.js` | `GET /api/health` |
| `api/ai/[task].js` | `POST /api/ai/test · generate · explain · report` |

`vercel.json`：

- `framework: vite`、`outputDirectory: dist`；函数 `maxDuration: 60s`（AI 生成最长 45s 超时）。
- SPA 回退规则 `/((?!api/|assets/).*) → /index.html`，**不会**把 `/api/*` 或静态资源改写成 `index.html`。
- `/api/*` 响应 `Cache-Control: no-store`；页面响应 CSP、`X-Frame-Options: DENY` 等安全头。

部署步骤：把代码推送到已连接 Vercel 的 GitHub 仓库即可自动部署；或 `npx vercel --prod`。无需配置任何环境变量——每位用户在「AI 设置」中填写自己的 Key。可选的服务端托管密钥在 Vercel 项目 Settings → Environment Variables 中配置 `AI_PROVIDER / AI_MODEL / AI_API_KEY`（**不要**加 `VITE_` 前缀）。

Vercel 上的限制：

- 函数无状态：每个请求只使用请求体中的配置，结束即丢弃，不同用户的 Key 不会混用；Key 不出现在 URL（Gemini 也使用请求头）中，代理不记录请求体。
- 代理限流是**单实例内存计数**（按 Vercel 提供的客户端 IP），多实例之间不共享，只能作为基础防护；真正的调用次数上限由客户端每日预算、每场练习请求上限与服务商自身限额共同保证。如需严格全局限流，可接入 Vercel KV / Upstash。
- SSRF 防护在每次建立连接时校验解析出的全部 IP，并在连接建立后再次校验实际对端地址；不跟随重定向。

### Cloudflare（自定义域名 www.campuseng.icu）

已实测：自定义域名经 Cloudflare 代理（橙色云）转发到 Vercel，`/api/*` 的 `cf-cache-status` 为 `DYNAMIC`（未缓存）。保持以下设置：

- DNS：`www` CNAME → `cname.vercel-dns.com`（或 Vercel 后台给出的值）。代理开启或仅 DNS 都可以；开启代理时 SSL/TLS 模式必须为 **Full (strict)**，否则会出现重定向循环。
- 缓存：不要为 `/api/*` 配置 “Cache Everything” 规则。代理已在响应中同时下发 `Cache-Control: no-store, private`、`CDN-Cache-Control: no-store`、`Cloudflare-CDN-Cache-Control: no-store`，即使存在宽泛的缓存规则也不会被 Cloudflare 缓存。
- 安全：若开启 Bot Fight Mode / WAF 托管质询，确保对 `POST /api/ai/*` 不弹出 JS Challenge（浏览器 fetch 无法完成质询，会表现为请求失败）。
- 不要开启 Rocket Loader（会改写内联脚本，可能影响主题初始化脚本）。

## 7. 本地联调（无需真实 Key）

```bash
node scripts/mock-ai-server.mjs                      # 模拟 OpenAI 兼容接口 :4300
LEXIMASTER_ALLOW_PRIVATE_BASE_URL=1 npm run dev      # 允许 localhost Base URL
```
设置页选「OpenAI 兼容接口」，Base URL `http://127.0.0.1:4300/v1`，Key `mock-key`，模型任意。

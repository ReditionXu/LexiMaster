# 测试报告（LexiMaster 3.0）

## 自动化测试（`npm test`，vitest）

```
 ✓ tests/ai.test.ts (37 tests) 133ms
 ✓ tests/server.test.mjs (49 tests) 106ms
 ✓ tests/exam.test.ts (4 tests) 13ms
 ✓ tests/migration.test.ts (6 tests) 12ms
 ✓ tests/units.test.ts (5 tests) 8ms
 Test Files  5 passed (5)
      Tests  101 passed (101)
```

| 文件 | 覆盖内容 |
| --- | --- |
| tests/migration.test.ts | v2→v3 迁移：4 个单元、125 题全部关联（27/31/33/34）、历史/考试记录关联与单元名快照、幂等性、30 个单元无上限、孤立 unitId 修复、已删除题目的历史记录 |
| tests/units.test.ts | UUID 与排序、上下移不改 ID、名称校验（空/重名/超长）、导入单元引用解析、归档与回收站单元不参与练习 |
| tests/exam.test.ts | 公开题面只含白名单字段、序列化后不含答案字段、确定性评分与答案键销毁、刷新恢复时重建答案键并移除已删除题目 |
| tests/ai.test.ts | isFormOf 词形判断（含不规则、派生、短语）、AI 题目 11 类违规拒绝、重复检测、扩展词汇授权、AI 解析不能改判、报告 ID 过滤、JSON 提取、出题流（批量预取、每词最多 2 次请求、致命错误立即停止并回退、取消）、学习统计、**用全部教材题库校准词形判断（0 误判）** |
| tests/server.test.mjs | SSRF：18 类私网/回环/元数据/IPv6 映射地址拦截、12 类非法 Base URL、DNS 解析到私网时在连接阶段拒绝、不跟随重定向；四家适配器请求/响应格式；401/404/429(Retry-After)/5xx/空响应映射；密钥脱敏；代理健康检查不泄露服务端密钥、未知任务/错误 Content-Type/非法配置/内网地址拒绝、批量上限、按 IP 限流 |

## 端到端测试（Playwright，构建产物 + mock 模型）

| 场景 | 结果 |
| --- | --- |
| 旧版 v2 数据（数字单元 + 40 条历史 + 考试）启动后自动迁移，生成备份，所有题目与历史均获得 unitId | 通过 |
| 新建 4 个自定义单元（含 CET-4 Vocabulary）、向自定义单元添加词汇、删除 Unit 4（提示词汇数与影响）→ 回收站 | 通过 |
| 模拟考试页面文本中不出现目标词原形/答案；进行中考试的本地存档不含 correctAnswer | 通过 |
| 考试中刷新 → 首页出现"继续考试" → 恢复作答进度与剩余时间 → 交卷出报告，存档清除 | 通过 |
| AI 设置：错误 Key 显示认证失败、正确 Key 连接成功；Key 未写入 localStorage / sessionStorage | 通过 |
| 生产服务（`npm start`，默认安全模式）：http:// Base URL 与 169.254.169.254 被拒绝；返回 CSP、X-Frame-Options 头 | 通过 |
| AI 出题 5 题：首批含无效题 → 自动重试/回退题库原题；AI 题目标注"AI 生成 · 已校验"；答错后自动 AI 解析 | 通过 |
| AI 学习报告：基于真实统计生成；模型编造的 wordId 被过滤；"生成专项训练"进入针对性 AI 练习 | 通过 |
| v2 回归：Quick Check 记录、错题单词重练、练习完成页、Esc 退出确认、模拟考试评分、重练错题、主题切换 | 通过 |
| 桌面 1440px 与 iPhone 13 宽度下题库/单元管理、AI 设置布局 | 通过（人工检查截图） |

未覆盖：真实 OpenAI / Anthropic / Gemini 账号的联网调用（测试环境无密钥且无法访问外网），适配器格式由单元测试按官方接口格式校验。

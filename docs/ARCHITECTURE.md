# LexiMaster 3.0 架构、数据结构与迁移

## 目录

```
server/
  index.mjs            生产服务器：静态托管 dist/ + /api 代理 + 安全响应头
  ai/handler.mjs       /api/health、/api/ai/{test,generate,explain,report}
  ai/providers.mjs     OpenAI / Anthropic / Gemini / 兼容接口适配器
  ai/prompts.mjs       按任务构建提示词 + 载荷校验
  ai/safeFetch.mjs     SSRF 防护的出站请求
  ai/errors.mjs        错误码、HTTP 映射、密钥脱敏
scripts/mock-ai-server.mjs   本地 mock 模型（E2E / 演示）
src/
  ai/settings.ts       AI 设置存储（Key 仅内存 / 可选 sessionStorage）、用量预算
  ai/client.ts         调用代理、错误归一化、JSON 提取
  ai/validate.ts       AI 题目 / 解析 / 报告的严格校验，isFormOf 词形判断
  ai/generator.ts      实时出题流：小批量预取、取消、超时、限流、重试上限、题库回退
  ai/learningStats.ts  学习数据聚合（AI 报告的唯一数据来源）
  lib/migration.ts     v1/v2 → v3 迁移（纯函数，可测试）
  lib/units.ts         单元工具：排序、归档/回收站、名称校验、导入引用解析
  lib/exam.ts          考试试卷拆分 PublicExamQuestion / PrivateAnswerKey、评分、恢复
  components/ai/       AISettings、AIPracticeSession、AIExplainCard、AIReportCard
  components/manager/UnitsPanel.tsx   单元管理（新建/改名/排序/归档/回收站/永久删除）
tests/                 vitest：migration / units / exam / ai / server
```

## 数据结构

```ts
interface Unit {
  id: string;            // UUID，永不改变
  name: string;          // "Unit 1"、"CET-4 Vocabulary"…
  description?: string;
  order: number;         // 显示顺序
  archived: boolean;     // 归档：不参与练习/考试/统计，可恢复
  deletedAt?: number;    // 回收站：可恢复，永久删除需二次确认
  createdAt: number; updatedAt: number;
  legacyNumber?: number; // 由 v2 迁移而来的原单元号，仅用于迁移与“恢复默认题库”
}
interface VocabularyQuestion { id; unitId: string; /* @deprecated */ unit?: number; …原有字段…; source?: 'bank'|'ai'|'ai-fallback'; wordId?: string }
interface PracticeConfig { mode; unitIds: string[]; questionCount; order; timed; timeLimitMinutes?; questionIds?; label? }
interface ExamSessionResult { …; unitIds?: string[]; unitNames?: string[] /* 单元名快照 */ }
```

localStorage 键：

| 键 | 内容 |
| --- | --- |
| `leximaster_units_v1` | Unit[] |
| `leximaster_questions_v2` | VocabularyQuestion[]（保持原键名，内容升级为含 unitId） |
| `leximaster_mastery_v1` / `history_v1` / `exams_v1` | 原有结构（记录中的题目快照补充 unitId） |
| `leximaster_schema_version` | 3 |
| `leximaster_backup_pre_v3` | 迁移前原始数据的完整备份 |
| `leximaster_active_exam_v1` | 进行中的考试（仅公开试卷 + 用户作答 + 截止时间） |
| `leximaster_ai_settings_v1` | AI 偏好（**不含** API Key） |

## 迁移方案（v1/v2 → v3）

启动时 `ensureMigrated()`（`utils/storage.ts`）：

1. 读取旧数据；若 schema < 3，先把原始题库/历史/考试/掌握度整体复制到 `leximaster_backup_pre_v3`。
2. `migrateSnapshot()`（纯函数）：按出现的旧单元号升序为每个编号创建一个 Unit（`Unit 1…N`，保留原英文副标题，记录 `legacyNumber`），**不设数量上限**。
3. 每道题补 `unitId`；每条答题历史与考试答卷中的题目快照补 `unitId`（优先取题库中同 ID 题目的单元，题目已被删除时按快照中的旧单元号）；考试记录补 `unitIds` 与 `unitNames` 快照。
4. 掌握度按题目 ID 存储，迁移不改变 ID，因此错题本与统计不受影响。
5. 幂等：再次运行不产生任何变化；从旧版备份文件恢复时会自动重新迁移。

## 删除规则

- 「删除」= 移入回收站：提示词汇数量、影响范围（不再出现在练习/考试/AI/统计中）、可恢复。
- 「永久删除」需在回收站中操作，并输入单元名称二次确认；删除单元及其词汇。考试成绩与答题历史保存了题目与单元名快照，不会丢失。

## 考试防泄题

`ExamSession` 只持有 `ExamPaper { examId, questions: PublicExamQuestion[] }`，答案键 `PrivateAnswerKey` 存放在 `lib/exam.ts` 的模块私有 Map 中，仅 `gradeExam()` 读取，评分后立即销毁。`ClozeLine` 的入参类型 `ClozePrompt` 只含句子与中文提示，编译期即无法传入答案字段。刷新恢复时只持久化公开试卷，答案键由题库重新生成。考试期间不调用任何 AI 接口；交卷后成绩报告才提供 AI 解析入口。

**已知限制**：纯本地模式下题库本身存放在浏览器中，懂开发者工具的用户仍能读取答案。要彻底防止，需要服务端保存题库与答案并负责评分（`gradeExam` 的签名已为此设计，可平移到服务端）。

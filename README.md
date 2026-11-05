# LexiMaster — 大学英语智能词汇测评系统

> **Learn with Context. Master with Confidence.**  
> 通过语境填空，精准检测你的英语词汇掌握程度。拒绝机械死记硬背，聚焦动词时态、分词变换、名词复数及语法搭配。

---

## 🌟 核心设计理念与特色

1. **语境填空（In-Sentence Cloze）**
   - 填空输入框直接嵌入英文句子内部，后方紧随中文提示 `(实现)`。
   - 严格考查真实句法变体，拒绝将单词原形误判为正确。
2. **多维语法判定引擎（Grammar Diagnostic Engine）**
   - **原形陷阱诊断（Base Form Trap）**：若在需要过去分词/过去式的句子中输入原形（如 `improve` 代替 `improved`），系统精准识别并给出针对性语法提示与解析。
   - **词尾屈折检查（Inflection Diagnostics）**：识别 `-ing` 与 `-ed` 混淆、名词不规则复数（`crisis` -> `crises`、`phenomenon` -> `phenomena`）等。
   - **拼写容差与近音诊断（Levenshtein Distance）**：识别 1~2 字符的轻微拼写失误并提示。
3. **三大专项目标模式**
   - **模式 A：日常练习模式**（单题即时对错与语法解析反馈，支持 Enter 一键进入下一题，自动聚焦输入框）。
   - **模式 B：考试模拟模式**（全真模拟期中考场，倒计时，支持答题卡跳转与标疑，交卷后统一评分并生成深度诊断报告）。
   - **模式 C：错题强化模式**（按错误频次加权降序呈现，自适应掌握度分级，避免“对一次就算掌握”的误判）。
4. **透明动态四级掌握度模型**
   - **Mastered（已掌握）**：连续 3 次以上正确或多次测试正确率 ≥ 85%。
   - **Familiar（基本掌握）**：近期答对，处于巩固提升期。
   - **Learning（学习中）**：正确率不稳定，需继续练习。
   - **Weak（薄弱词汇）**：多次答错或近期持续失分。
5. **教材题库全格式导入与校验机制**
   - 支持 **Excel（.xlsx / .xls）**、**CSV**、**JSON** 格式直接导入。
   - 导入时自动检查：必填项校验、单一填空位检查（`_____`）、重复题目过滤与异常友好提示，绝不因单行格式问题导致程序崩溃。
6. **离线持久化与数据备份**
   - 自动持久化存储于浏览器 LocalStorage，刷新不丢失。
   - 支持一键导出 JSON 备份文件及跨设备恢复。
7. **学术优雅的 UI/UX 设计**
   - 遵循 Academic & Minimal 视觉风格，支持明亮与深色（Dark Mode）模式。
   - 支持一键开启“专注模式（Focus Mode）”及原生 Web Speech 句子/单词朗读。

---

## 🤖 LexiMaster 3.0 · AI 自适应学习

- **多模型接入**：OpenAI / Anthropic Claude / Google Gemini / OpenAI 兼容接口，经同源服务端代理转发；API Key 默认只存在内存中。详见 [docs/AI.md](docs/AI.md)。
- **AI 智能出题**：按所选单元与目标词实时造句，小批量预取、可取消、超时与限流处理；每道题通过结构、词形、防泄题与确定性评分自检后才可作答，失败自动回退题库原题。
- **AI 答案解析**：先由原有评分引擎判定对错，再由 AI 讲解错误类型（拼写/时态/单复数/词性/搭配/其他）、语法知识与记忆建议，AI 不能改变评分。
- **AI 学习分析**：程序先根据真实作答记录计算统计数据，AI 只做解读；数据不足时明确提示；建议可一键生成专项训练。
- **动态单元管理**：单元数量不再受限；支持新建、改名、排序、导入、归档、回收站与二次确认的永久删除；旧版 Unit 1–4 数据自动迁移（迁移前完整备份）。
- **考试防泄题**：考试期间只向界面提供公开题面（编号、句子、中文提示），答案键与评分逻辑隔离；支持刷新后恢复考试与剩余时间。
- 架构、数据结构与迁移方案见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## ✨ LexiMaster 2.0 · 视觉与交互重构

- **设计语言 "Editorial Calm"**：Newsreader 衬线承载英文句子与标题，Inter 承载界面；暖白纸面（浅色）与多层 Charcoal（深色）分别独立设计。
- **Design Tokens**：全部颜色、圆角、阴影定义在 `src/index.css` 的 CSS 变量中，并映射到 Tailwind（`bg-canvas / bg-surface / text-ink-2 / border-line / text-accent …`）。图表配色已通过色盲安全校验。
- **Motion System**：`src/lib/motion.ts` 统一时长与 Spring 参数，基于 [Motion](https://motion.dev)；全站遵循 `prefers-reduced-motion`。
- **UI 基础组件**：`src/components/ui/`（Button、Segmented、Modal/ConfirmDialog、AnimatedNumber、ProgressRing、Sparkline、StackedBar…）。
- **练习体验**：输入框嵌入句子、正误反馈、错误字母差异高亮、题目平滑切换、完成练习仪式感页面、移动端键盘连续输入。
- **新增**：首页 Quick Check（真实题目，计入学习记录）、错题本单词级重练、掌握度分析（Recharts 图表、学习活动热力图、成绩趋势范围切换）。
- **修复**：错题重练现在精确练习答错的那几题；考试倒计时到点自动交卷会读取最新答案。

> 升级后首次运行请先执行 `npm install`（新增依赖：`motion`、`recharts`）。

## 🚀 启动与使用指南

需要 Node.js 18.17 或更高版本。

### 1. 本地开发
```bash
npm install
npm run dev          # http://localhost:5173 ，AI 代理已随开发服务器一起启动
npm test             # 运行自动化测试
```

### 2. 生产部署（含 AI 功能）
```bash
npm run build
npm start            # 默认 http://127.0.0.1:8787 ，可用 PORT / HOST 环境变量调整
```
`npm start` 会同时提供前端页面与 `/api` AI 代理，可部署到任何能运行 Node 的平台（云服务器、Render、Railway、Fly.io 等），建议放在 HTTPS 反向代理之后。可选的服务端托管密钥等配置见 `.env.example`。

### 3. 纯静态部署
`dist/` 仍可直接托管到 GitHub Pages / Netlify 等静态服务，但这种方式没有服务端代理，**AI 功能不可用**（设置页会提示），其余功能完全正常。

---

## 📥 教材题库导入规范（Unit 1 & Unit 2）

你可以通过系统顶部的**【题库管理】**页面，点击“下载 Excel 导入标准模板”，或直接准备如下格式的数据文件导入：

### 1. Excel / CSV 表头规范
| 列名 | 必填 | 示例值 | 说明 |
| :--- | :---: | :--- | :--- |
| `unit` | 是 | `1` | 单元编号（正整数，如 1、2） |
| `word` | 是 | `achieve` | 单词原形/词根 |
| `sentence` | 是 | `She finally _____ her dream.` | 英文例句（必须包含恰好一个 `_____`） |
| `chineseHint` | 是 | `实现` | 填空后方显示的中文释义 |
| `correctAnswer` | 是 | `achieved` | 符合句中时态的正确答案 |
| `acceptedAnswers` | 否 | `achieved; fulfilled` | 分号或逗号分隔的其他可接受变体 |
| `partOfSpeech` | 否 | `verb` | 词性（`verb`, `noun`, `adjective`, `adverb`） |
| `grammarNote` | 否 | `一般过去时` | 语法考点简注 |
| `explanation` | 否 | `描述过去动作，需用过去式 achieved。` | 详细答题解析 |
| `difficulty` | 否 | `medium` | 难度（`easy`, `medium`, `hard`） |
| `phonetic` | 否 | `/əˈtʃiːv/` | 音标（可选） |
| `collocation` | 否 | `achieve dream` | 常见短语搭配（可选） |

### 2. JSON 格式示例
```json
[
  {
    "id": "U1-001",
    "unit": 1,
    "word": "improve",
    "sentence": "The economic situation has _____ significantly.",
    "chineseHint": "改善",
    "correctAnswer": "improved",
    "acceptedAnswers": ["improved"],
    "partOfSpeech": "verb",
    "grammarNote": "现在完成时(过去分词)",
    "explanation": "助动词 has 后面接动词过去分词 improved，不可输入原形 improve。",
    "difficulty": "medium"
  }
]
```

---

## ⌨️ 键盘交互快捷键

- **Enter**：在练习模式中提交答案；反馈出现后按 Enter 直接进入下一题。
- **Enter**：在模拟考试模式中，按 Enter 自动跳入下一题，避免意外提交整份试卷。
- **Tab**：在界面可聚焦控件之间快速切换。

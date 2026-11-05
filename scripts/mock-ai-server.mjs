// Mock OpenAI-compatible endpoint for end-to-end tests and offline demos.
//   node scripts/mock-ai-server.mjs   (listens on 127.0.0.1:4300)
// Requires LEXIMASTER_ALLOW_PRIVATE_BASE_URL=1 on the app side, because localhost is
// blocked by the SSRF guard by default.
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 4300);
let generateCalls = 0;

const contexts = [
  'During last week\'s seminar, the professor noted that the research team _____ the data with great care.',
  'Many first-year students say the new library hours have _____ their study routine considerably.',
  'In the final report, the committee explained why the old policy was _____ by a clearer one.',
  'Our tutor reminded us that a good essay is _____ by careful planning and honest revision.',
];

function reply(res, content) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
}

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer mock-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
      }
      const j = JSON.parse(body || '{}');
      const sys = j.messages?.[0]?.content || '';
      const user = j.messages?.[1]?.content || '';
      if (sys.includes('connectivity check')) return reply(res, '{"ok": true}');
      if (sys.includes('fill-in-the-blank')) {
        generateCalls++;
        const { targets } = JSON.parse(user);
        const questions = targets.map((t, i) => {
          const answer = t.exampleAnswerForm || t.lemma;
          const bad = generateCalls === 1 && i === 0; // first item of first batch is invalid → exercises retry
          return {
            wordId: t.wordId,
            lemma: t.lemma,
            sentence: bad ? 'This _____ sentence has _____ two blanks.' : contexts[(generateCalls + i) % contexts.length],
            chineseHint: t.chineseHint,
            correctAnswer: answer,
            acceptedAnswers: [answer],
            grammarNote: '语境词形',
            explanation: `根据句意与语法结构，此处应填 ${answer}。`,
            difficulty: 'medium',
          };
        });
        return setTimeout(() => reply(res, '```json\n' + JSON.stringify({ questions }) + '\n```'), 400);
      }
      if (sys.includes('grammar tutor')) {
        const p = JSON.parse(user);
        return reply(res, JSON.stringify({
          errorCategory: p.verdict === 'correct' ? 'none' : 'tense',
          reason: `句中需要「${p.correctAnswer}」这一形式，而你填写的是「${p.userAnswer || '空'}」。`,
          grammarPoint: '根据句子结构确定动词或名词的正确形式。',
          usage: `${p.correctAnswer} 常用于类似语境，例如 the ${p.lemma} of …`,
          memoryTip: '先看空格前后的助动词或冠词，再决定词形。',
          alternativeMayBeValid: false,
        }));
      }
      if (sys.includes('learning analyst')) {
        const d = JSON.parse(user);
        const ids = (d.topErrorWords || []).slice(0, 3).map((w) => w.wordId);
        return reply(res, JSON.stringify({
          summary: d.sampleSufficient ? `你共作答 ${d.totals.answers} 次，累计正确率 ${d.totals.accuracyPct}%。` : '学习数据不足，以下结论仅供参考。',
          weakWords: ids.map((id) => ({ wordId: id, reason: '多次在词形变化上出错。' })).concat([{ wordId: 'invented-id', reason: '不应出现' }]),
          grammarIssues: (d.errorTypes || []).slice(0, 2).map((e) => ({ type: e.label, insight: `共出现 ${e.count} 次，需重点复习。` })),
          recommendations: [{ title: '高频错词专项', detail: '围绕出错最多的词进行词形变化练习。', wordIds: ids, unitIds: [], focusInflection: true }],
        }));
      }
      reply(res, '{}');
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`mock AI on http://127.0.0.1:${port}/v1`));

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Brain, Lightbulb, RefreshCw, Sparkles } from 'lucide-react';
import type { AnswerEvaluation, VocabularyQuestion } from '../../types';
import { aiRequest, AIError, extractJSON } from '../../ai/client';
import { AIExplanation, ERROR_CATEGORY_LABEL, validateExplanation } from '../../ai/validate';
import { aiReady, useAISettings } from '../../ai/settings';
import { ease } from '../../lib/motion';

/**
 * AI explanation — runs only AFTER deterministic grading. The verdict, the correct
 * answer and the user's answer shown here come from the program, never from the model.
 */

const CACHE_KEY = 'leximaster_ai_explain_cache_v1';
const memory = new Map<string, AIExplanation>();
function cacheKey(q: VocabularyQuestion, user: string) {
  return `${q.id}|${q.sentence.length}|${user.trim().toLowerCase()}`;
}
function readCache(k: string): AIExplanation | undefined {
  if (memory.has(k)) return memory.get(k);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    if (all[k]) memory.set(k, all[k]);
    return all[k];
  } catch {
    return undefined;
  }
}
function writeCache(k: string, v: AIExplanation) {
  memory.set(k, v);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[k] = v;
    const keys = Object.keys(all);
    if (keys.length > 150) keys.slice(0, keys.length - 150).forEach((x) => delete all[x]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {}
}

interface Props {
  question: VocabularyQuestion;
  userAnswer: string;
  evaluation: AnswerEvaluation;
  /** 'auto' follows the user's explain-mode setting; 'manual' always waits for a click. */
  trigger?: 'auto' | 'manual';
  compact?: boolean;
}

export const AIExplainCard: React.FC<Props> = ({ question, userAnswer, evaluation, trigger = 'auto', compact }) => {
  const { settings } = useAISettings();
  const ready = aiReady('explain', settings);
  const k = cacheKey(question, userAnswer);
  const [data, setData] = useState<AIExplanation | undefined>(() => readCache(k));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const verdict: 'correct' | 'incorrect' = evaluation.isCorrect ? 'correct' : 'incorrect';
  const shouldAuto =
    trigger === 'auto' && (settings.explainMode === 'always' || (settings.explainMode === 'wrong-only' && verdict === 'incorrect'));

  const run = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const res = await aiRequest(
        'explain',
        {
          sentence: question.sentence,
          chineseHint: question.chineseHint,
          lemma: question.word,
          correctAnswer: question.correctAnswer,
          acceptedAnswers: question.acceptedAnswers,
          userAnswer,
          verdict,
          feedbackType: evaluation.feedbackType,
          grammarNote: question.grammarNote,
        },
        { signal: c.signal }
      );
      const parsed = validateExplanation(extractJSON(res.content), verdict);
      writeCache(k, parsed);
      if (!c.signal.aborted) setData(parsed);
    } catch (e) {
      if (c.signal.aborted) return;
      const err = e as AIError;
      if (err.code !== 'cancelled') setError(err.message || 'AI 解析失败');
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && shouldAuto && !data && !loading) void run();
    return () => ctrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, ready]);

  if (!ready) return null;

  return (
    <div className={`${compact ? 'mt-3' : 'mt-4'} rounded-lg border border-accent/20 bg-accent-soft/40 px-4 py-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          AI 解析
          {data && <span className="font-normal text-ink-3">· {ERROR_CATEGORY_LABEL[data.errorCategory]}</span>}
        </span>
        {!data && !loading && (
          <button onClick={run} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent hover:bg-accent-soft">
            {error ? <RefreshCw className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
            {error ? '重试' : '让 AI 讲解'}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {loading && (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2.5 space-y-2" aria-busy="true" aria-label="AI 正在分析">
            <div className="h-3 w-4/5 animate-pulse rounded bg-accent/10" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-accent/10" />
          </motion.div>
        )}
        {error && !loading && (
          <motion.p key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2" role="status">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-ink" />
            {error}（不影响评分结果）
          </motion.p>
        )}
        {data && !loading && (
          <motion.div
            key="d"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: ease.out }}
            className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-ink-2"
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-ink-3">正确答案</dt>
              <dd className="font-serif text-[15px] italic text-success">{question.correctAnswer}</dd>
              <dt className="text-ink-3">你的答案</dt>
              <dd className={`font-serif text-[15px] italic ${evaluation.isCorrect ? 'text-success' : 'text-danger'}`}>{userAnswer || '（未作答）'}</dd>
              <dt className="text-ink-3">{evaluation.isCorrect ? '为什么对' : '错误原因'}</dt>
              <dd>{data.reason}</dd>
              <dt className="text-ink-3">语法知识</dt>
              <dd>{data.grammarPoint}</dd>
              {data.usage && (
                <>
                  <dt className="text-ink-3">用法</dt>
                  <dd>{data.usage}</dd>
                </>
              )}
            </dl>
            {data.memoryTip && (
              <p className="flex items-start gap-1.5 rounded-md bg-surface/70 px-2.5 py-1.5 text-[13px]">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-ink" />
                {data.memoryTip}
              </p>
            )}
            {data.alternativeMayBeValid && (
              <p className="text-[12.5px] text-ink-3">
                AI 复核意见：你的答案可能也成立——{data.alternativeNote || '建议向老师确认'}。此意见仅供参考，不会改变评分。
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

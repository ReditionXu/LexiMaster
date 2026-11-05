import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ArrowRight, Loader2, RefreshCw, Sparkles, Settings2 } from 'lucide-react';
import type { AIPracticeConfig, ExamSessionResult, Unit, UserAnswerRecord, VocabularyQuestion, WordMasteryRecord } from '../../types';
import { aiRequest, AIError, extractJSON } from '../../ai/client';
import { AIReport, validateReport } from '../../ai/validate';
import { buildLearningStats, MIN_ANSWERS_FOR_REPORT, statsFingerprint } from '../../ai/learningStats';
import { aiReady, useAISettings } from '../../ai/settings';
import { Button } from '../ui/Button';
import { ease } from '../../lib/motion';

/**
 * AI learning report. Statistics are computed by the program (buildLearningStats);
 * only that summary is sent. Generated on demand, cached per data fingerprint.
 */

const CACHE_KEY = 'leximaster_ai_report_v1';

interface Props {
  questions: VocabularyQuestion[];
  units: Unit[];
  masteryRecords: Record<string, WordMasteryRecord>;
  history: UserAnswerRecord[];
  exams: ExamSessionResult[];
  onStartAI: (cfg: AIPracticeConfig) => void;
  onOpenSettings: () => void;
}

export const AIReportCard: React.FC<Props> = ({ questions, units, masteryRecords, history, exams, onStartAI, onOpenSettings }) => {
  const { settings } = useAISettings();
  const ready = aiReady('report', settings);
  const stats = useMemo(() => buildLearningStats(questions, units, masteryRecords, history, exams), [questions, units, masteryRecords, history, exams]);
  const fp = statsFingerprint(stats);
  const [cached, setCached] = useState<{ fp: string; at: number; report: AIReport } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const nameOf = (id: string) => questions.find((q) => q.id === id)?.word ?? id;
  const generateOk = aiReady('generate', settings);

  const run = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const res = await aiRequest('report', stats, { signal: c.signal });
      const report = validateReport(extractJSON(res.content), {
        wordIds: new Set(questions.map((q) => q.id)),
        unitIds: new Set(units.map((u) => u.id)),
      });
      const entry = { fp, at: Date.now(), report };
      setCached(entry);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
      } catch {}
    } catch (e) {
      if (!c.signal.aborted) setError((e as AIError).message || '生成失败');
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  };

  const report = cached?.report;
  const stale = cached && cached.fp !== fp;
  const insufficient = !stats.sampleSufficient;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-accent" />
            AI 学习分析
          </h3>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-3">
            程序先根据你的 {stats.sampleSize} 条真实作答记录计算统计数据，AI 只基于这些数据做解读，不会编造分数或趋势。
          </p>
        </div>
        {ready ? (
          <Button
            variant={report && !stale ? 'secondary' : 'primary'}
            size="sm"
            onClick={run}
            disabled={loading}
            leading={loading ? <Loader2 className="animate-spin" /> : report ? <RefreshCw /> : <Sparkles />}
          >
            {loading ? '分析中…' : report ? (stale ? '数据已更新，重新生成' : '重新生成') : '生成学习报告'}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" leading={<Settings2 />} onClick={onOpenSettings}>
            连接 AI 后可用
          </Button>
        )}
      </div>

      <div className="p-6">
        {insufficient && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft/60 px-3 py-2.5 text-[13px] text-ink-2" role="status">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
            学习数据不足：目前只有 {stats.sampleSize} 条作答记录（建议至少 {MIN_ANSWERS_FOR_REPORT} 条）。报告结论仅供参考。
          </p>
        )}
        {error && (
          <p className="mb-4 flex items-start gap-2 text-[13px] text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {loading && !report ? (
            <motion.div key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5" aria-busy="true">
              {[90, 75, 82, 60].map((w) => (
                <div key={w} className="h-3.5 animate-pulse rounded bg-sunken" style={{ width: `${w}%` }} />
              ))}
            </motion.div>
          ) : report ? (
            <motion.div key={cached!.at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: ease.out }} className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
              <div>
                <div className="eyebrow mb-2">学习表现</div>
                <p className="text-[14.5px] leading-relaxed text-ink">{report.summary}</p>
                <p className="mt-1.5 text-[12px] text-ink-3">
                  生成于 {new Date(cached!.at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {stale && ' · 之后又有新的作答记录'}
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {report.weakWords.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">薄弱词汇诊断</div>
                    <ul className="space-y-2">
                      {report.weakWords.map((w) => (
                        <li key={w.wordId} className="text-[13.5px] leading-relaxed text-ink-2">
                          <span className="mr-2 font-serif text-[15px] italic text-ink">{nameOf(w.wordId)}</span>
                          {w.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.grammarIssues.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">语法问题分析</div>
                    <ul className="space-y-2">
                      {report.grammarIssues.map((g, i) => (
                        <li key={i} className="text-[13.5px] leading-relaxed text-ink-2">
                          <span className="mr-1.5 font-medium text-ink">{g.type}</span>
                          {g.insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {report.recommendations.length > 0 && (
                <div>
                  <div className="eyebrow mb-2">个性化复习建议</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {report.recommendations.map((r, i) => {
                      const words = r.wordIds.length ? r.wordIds : [];
                      const unitIds = r.unitIds.length ? r.unitIds : Array.from(new Set(words.map((id) => questions.find((q) => q.id === id)?.unitId).filter(Boolean) as string[]));
                      const actionable = generateOk && (words.length > 0 || unitIds.length > 0);
                      return (
                        <div key={i} className="flex flex-col rounded-lg border border-line p-4">
                          <div className="text-[14px] font-medium text-ink">{r.title}</div>
                          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-2">{r.detail}</p>
                          {words.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {words.slice(0, 8).map((id) => (
                                <span key={id} className="rounded bg-sunken px-1.5 py-0.5 font-serif text-[12.5px] italic text-ink-2">
                                  {nameOf(id)}
                                </span>
                              ))}
                            </div>
                          )}
                          {actionable && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="-ml-2 mt-2 self-start"
                              trailing={<ArrowRight />}
                              nudge
                              onClick={() =>
                                onStartAI({
                                  unitIds,
                                  wordIds: words.length ? words : undefined,
                                  questionCount: Math.min(10, words.length || 10),
                                  difficulty: 'mixed',
                                  weakFirst: true,
                                  random: false,
                                  focusInflection: r.focusInflection,
                                  label: `AI 专项 · ${r.title}`,
                                })
                              }
                            >
                              生成专项训练
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.p key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13.5px] text-ink-3">
              {ready ? '点击「生成学习报告」，AI 会给出表现总结、薄弱词诊断、语法问题分析和可直接开练的复习建议。' : '在「AI 设置」中连接模型并开启「AI 学习分析」后即可使用。'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

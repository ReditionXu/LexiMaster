import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BarChart3, Database, Flame, Loader2, Sparkles, X } from 'lucide-react';
import type { AIPracticeConfig, AnswerEvaluation, Unit, UserAnswerRecord, VocabularyQuestion, WordMasteryRecord } from '../../types';
import { evaluateAnswer, calculateMastery } from '../../utils/grammarEngine';
import { AIQuestionStream, buildTargets, StreamState } from '../../ai/generator';
import { ClozeLine, FeedbackPanel, SpeakButton } from '../sentence/SentenceClozeInput';
import { AIExplainCard } from './AIExplainCard';
import { SessionSummary } from '../practice/PracticeSession';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Modal';
import { LinearProgress } from '../ui/DataViz';
import { EmptyState } from '../ui/Common';
import { questionVariants, spring } from '../../lib/motion';
import { unitLabel } from '../../lib/units';

interface Props {
  questions: VocabularyQuestion[];
  units: Unit[];
  config: AIPracticeConfig;
  masteryRecords: Record<string, WordMasteryRecord>;
  onRecordAnswer: (record: UserAnswerRecord, mastery: WordMasteryRecord | null) => void;
  onExit: () => void;
  onRestart: () => void;
  onOpenReport: () => void;
  onRetest: (wrong: VocabularyQuestion[]) => void;
}

export const AIPracticeSession: React.FC<Props> = ({ questions, units, config, masteryRecords, onRecordAnswer, onExit, onRestart, onOpenReport, onRetest }) => {
  // Targets are fixed at session start (mastery changes during the session must not reshuffle them).
  const targets = useMemo(() => buildTargets(questions, config, masteryRecords), []); // eslint-disable-line react-hooks/exhaustive-deps
  const streamRef = useRef<AIQuestionStream | null>(null);
  const [state, setState] = useState<StreamState | null>(null);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [shakeSignal, setShakeSignal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [results, setResults] = useState({ correct: 0, wrong: [] as VocabularyQuestion[] });
  const [finished, setFinished] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const startTime = useRef(Date.now());
  const sessionStart = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const keeper = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = new AIQuestionStream(targets, units, config);
    streamRef.current = s;
    const off = s.subscribe(setState);
    s.pump(0);
    return () => {
      off();
      s.dispose(); // cancels any in-flight request
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    streamRef.current?.setConsumed(index);
  }, [index]);

  const item = state?.ready[index];
  const current = item?.question;
  const answered = results.correct + results.wrong.length;
  const total = targets.length;

  const submit = () => {
    if (!current || showFeedback || !input.trim()) return;
    // 1) Deterministic grading — the AI never decides correctness.
    const ev = evaluateAnswer(input, current);
    setEvaluation(ev);
    setShowFeedback(true);
    if (ev.isCorrect) {
      const n = streak + 1;
      setStreak(n);
      setBestStreak((b) => Math.max(b, n));
      setResults((r) => ({ ...r, correct: r.correct + 1 }));
    } else {
      setStreak(0);
      setShakeSignal((x) => x + 1);
      const bank = item?.wordId ? questions.find((q) => q.id === item.wordId) : undefined;
      setResults((r) => ({ ...r, wrong: [...r.wrong, bank ?? current] }));
    }
    const wordId = item?.wordId;
    const mastery = wordId ? calculateMastery(masteryRecords[wordId], wordId, ev.isCorrect, input, ev.feedbackType) : null;
    onRecordAnswer(
      {
        questionId: wordId ?? current.id,
        question: current,
        userAnswer: input,
        isCorrect: ev.isCorrect,
        timeSpentSeconds: Math.max(1, Math.round((Date.now() - startTime.current) / 1000)),
        evaluation: ev,
        timestamp: Date.now(),
      },
      mastery
    );
  };

  const next = useCallback(() => {
    if (document.activeElement instanceof HTMLInputElement) keeper.current?.focus({ preventScroll: true });
    if (index + 1 >= total) {
      keeper.current?.blur();
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setInput('');
    setEvaluation(null);
    setShowFeedback(false);
    startTime.current = Date.now();
  }, [index, total]);

  const requestExit = useCallback(() => {
    if (answered > 0 && !finished) setConfirmExit(true);
    else onExit();
  }, [answered, finished, onExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmExit || finished) return;
      const typing = (e.target as HTMLElement).tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        requestExit();
      } else if (e.key === 'Enter' && !typing && showFeedback && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmExit, finished, showFeedback, next, requestExit]);

  const title = config.label ?? `AI 练习 · ${config.unitIds.map((id) => unitLabel(units, id)).slice(0, 3).join(' · ')}`;

  if (targets.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <div className="card">
          <EmptyState cloze title="所选范围内没有可用词汇" description="请换一个单元，或先在题库中导入词汇。" action={<Button variant="primary" onClick={onExit}>返回</Button>} />
        </div>
      </div>
    );
  }

  if (finished) {
    const st = state?.stats;
    return (
      <SessionSummary
        total={answered}
        correct={results.correct}
        wrong={results.wrong}
        bestStreak={bestStreak}
        seconds={Math.round((Date.now() - sessionStart.current) / 1000)}
        title={title}
        onRetest={onRetest}
        onRestart={onRestart}
        onHome={onExit}
        extra={
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                AI 生成 {st?.aiItems ?? 0} 题
              </span>
              {st && st.fallbacks > 0 && <span> · 题库回退 {st.fallbacks} 题</span>}
              <span> · 请求 {st?.requests ?? 0} 次</span>
            </div>
            <Button size="sm" variant="secondary" leading={<BarChart3 />} onClick={onOpenReport}>
              生成 AI 学习报告
            </Button>
          </div>
        }
      />
    );
  }

  const progress = (index + (showFeedback ? 1 : 0)) / total;
  const status = showFeedback && evaluation ? (evaluation.isCorrect ? 'correct' : 'incorrect') : 'idle';
  const waiting = !current;

  return (
    <div className="relative min-h-[100dvh]">
      <input ref={keeper} aria-hidden tabIndex={-1} className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" style={{ fontSize: 16 }} />

      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Button variant="ghost" size="icon" onClick={requestExit} aria-label="退出练习">
            <X className="h-[18px] w-[18px]" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <span className="hidden max-w-[240px] items-center gap-1.5 truncate text-[13px] font-medium text-ink-2 sm:inline-flex">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{title}</span>
            </span>
            <LinearProgress value={progress} className="flex-1" />
            <span className="num shrink-0 text-[13px] font-medium text-ink">
              {Math.min(index + 1, total)}
              <span className="text-ink-3"> / {total}</span>
            </span>
          </div>
          <AnimatePresence>
            {streak >= 3 && (
              <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.snappy} className="hidden items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[12px] font-semibold text-warning-ink sm:inline-flex">
                <Flame className="h-3 w-3" />
                {streak}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] px-5 pb-44 pt-[clamp(36px,11vh,120px)] sm:px-8">
        <AnimatePresence mode="wait" initial={false}>
          {waiting ? (
            <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6" aria-busy="true">
              <div className="flex items-center gap-2 text-[13.5px] text-ink-2" role="status">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                {state?.error ?? 'AI 正在为你出题，并逐题校验…'}
              </div>
              <div className="space-y-3">
                <div className="h-7 w-11/12 animate-pulse rounded-md bg-sunken" />
                <div className="h-7 w-2/3 animate-pulse rounded-md bg-sunken" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                leading={<Database />}
                onClick={() => streamRef.current?.fallbackRemaining('你选择了改用题库练习')}
              >
                不等了，改用题库原题
              </Button>
            </motion.div>
          ) : (
            <motion.div key={current.id} variants={questionVariants} initial="initial" animate="animate" exit="exit">
              <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
                  <span className="eyebrow !text-ink-2">Question {String(index + 1).padStart(2, '0')}</span>
                  <span>{unitLabel(units, current.unitId)}</span>
                  {current.source === 'ai' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent">
                      <Sparkles className="h-3 w-3" />
                      AI 生成 · 已校验
                    </span>
                  ) : (
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink-2" title={item?.fallbackReason}>
                      题库原题{item?.fallbackReason ? ` · ${item.fallbackReason.slice(0, 24)}` : ''}
                    </span>
                  )}
                </div>
                <SpeakButton question={current} />
              </div>

              <ClozeLine
                question={current}
                value={input}
                onChange={(v) => !showFeedback && setInput(v)}
                onEnter={() => (showFeedback ? next() : submit())}
                status={status}
                inputRef={inputRef}
                enterKeyHint={showFeedback ? 'next' : 'done'}
                placeholder="输入单词"
                shakeSignal={shakeSignal}
              />
              <div className="mt-5 text-[13px] text-ink-3">
                原形 <span className="font-serif text-[15px] italic text-ink-2">{current.word}</span>
                {current.phonetic && <span className="ml-2">{current.phonetic}</span>}
              </div>

              <AnimatePresence>
                {showFeedback && evaluation && (
                  <FeedbackPanel
                    question={current}
                    evaluation={evaluation}
                    userAnswer={input}
                    aiSlot={<AIExplainCard question={current} userAnswer={input} evaluation={evaluation} />}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        {state?.generating && !waiting && (
          <p className="mt-6 flex items-center gap-1.5 text-[12px] text-ink-3" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在后台准备后续题目…
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0 pb-safe">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4 px-5 pb-5 pt-8 sm:px-8 sm:pb-8">
          <div className="hidden items-center gap-4 text-[12.5px] text-ink-3 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Enter</span>
              {showFeedback ? '下一题' : '提交'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Esc</span>退出
            </span>
          </div>
          <Button
            variant={showFeedback ? 'inverse' : 'primary'}
            size="lg"
            className="w-full sm:w-auto sm:min-w-[160px]"
            disabled={waiting || (!showFeedback && !input.trim())}
            onClick={() => (showFeedback ? next() : (submit(), inputRef.current?.focus({ preventScroll: true })))}
            trailing={showFeedback ? <ArrowRight /> : undefined}
            nudge
          >
            {waiting ? '出题中…' : showFeedback ? (index + 1 >= total ? '完成练习' : '下一题') : '提交答案'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="结束本次 AI 练习？"
        description={`已作答的 ${answered} 题已保存。未使用的预取题目会被丢弃，进行中的请求会被取消。`}
        confirmLabel="结束练习"
        cancelLabel="继续练习"
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          setConfirmExit(false);
          streamRef.current?.dispose();
          onExit();
        }}
      />
    </div>
  );
};

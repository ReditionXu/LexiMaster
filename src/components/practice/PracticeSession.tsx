import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  Bookmark,
  Flame,
  Home,
  RotateCcw,
  Shuffle,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  VocabularyQuestion,
  PracticeConfig,
  AnswerEvaluation,
  UserAnswerRecord,
  WordMasteryRecord,
} from '../../types';
import { evaluateAnswer, calculateMastery } from '../../utils/grammarEngine';
import { getAlternateSentence, SENTENCE_VARIANTS } from '../../data/sentenceVariations';
import { ClozeLine, FeedbackPanel, SpeakButton } from '../sentence/SentenceClozeInput';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Modal';
import { AnimatedNumber, LinearProgress, ProgressRing } from '../ui/DataViz';
import { EmptyState } from '../ui/Common';
import { getUnitMeta } from '../../lib/insights';
import { duration, ease, questionVariants, riseIn, spring, staggerContainer } from '../../lib/motion';

interface PracticeSessionProps {
  questions: VocabularyQuestion[];
  config: PracticeConfig;
  masteryRecords: Record<string, WordMasteryRecord>;
  isAudioEnabled?: boolean;
  onToggleAudio?: () => void;
  onRecordAnswer: (record: UserAnswerRecord, updatedMastery: WordMasteryRecord) => void;
  onToggleBookmark: (wordId: string) => void;
  onRetest?: (wrong: VocabularyQuestion[]) => void;
  onRestart?: () => void;
  onFinish: () => void;
  onExit: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({
  questions,
  config,
  masteryRecords,
  isAudioEnabled = true,
  onToggleAudio,
  onRecordAnswer,
  onToggleBookmark,
  onRetest,
  onRestart,
  onFinish,
  onExit,
}) => {
  const [queue, setQueue] = useState<VocabularyQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [variantNonce, setVariantNonce] = useState(0);
  const [shakeSignal, setShakeSignal] = useState(0);
  const [finished, setFinished] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [sessionResults, setSessionResults] = useState<{
    correct: number;
    incorrect: number;
    wrongQuestions: VocabularyQuestion[];
  }>({ correct: 0, incorrect: 0, wrongQuestions: [] });

  const sessionStart = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardKeeper = useRef<HTMLInputElement>(null);

  // Initialize questions (selection logic unchanged; explicit questionIds take priority)
  useEffect(() => {
    let pool: VocabularyQuestion[];
    if (config.questionIds && config.questionIds.length > 0) {
      const byId = new Map(questions.map((q) => [q.id, q]));
      pool = config.questionIds.map((id) => byId.get(id)).filter(Boolean) as VocabularyQuestion[];
    } else {
      pool = questions.filter((q) => config.units.includes(q.unit));
    }

    if (config.order === 'random') {
      pool = [...pool].sort(() => Math.random() - 0.5);
    } else if (config.order === 'weakest-first') {
      pool = [...pool].sort((a, b) => {
        const recA = masteryRecords[a.id];
        const recB = masteryRecords[b.id];
        const scoreA = recA?.masteryLevel === 'weak' ? -2 : recA?.masteryLevel === 'learning' ? -1 : 0;
        const scoreB = recB?.masteryLevel === 'weak' ? -2 : recB?.masteryLevel === 'learning' ? -1 : 0;
        return scoreA - scoreB;
      });
    }

    if (config.questionCount > 0 && pool.length > config.questionCount) {
      pool = pool.slice(0, config.questionCount);
    }

    setQueue(pool);
    setCurrentIndex(0);
    setCurrentInput('');
    setEvaluation(null);
    setShowFeedback(false);
    setStartTime(Date.now());
    sessionStart.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, questions]);

  const currentQ = queue[currentIndex];
  const answered = sessionResults.correct + sessionResults.incorrect;

  const handleSubmit = () => {
    if (!currentQ || showFeedback) return;
    if (!currentInput.trim()) return;

    const timeSpent = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const evalResult = evaluateAnswer(currentInput, currentQ);
    setEvaluation(evalResult);
    setShowFeedback(true);

    if (evalResult.isCorrect) {
      const s = streak + 1;
      setStreak(s);
      setBestStreak((b) => Math.max(b, s));
      setSessionResults((prev) => ({ ...prev, correct: prev.correct + 1 }));
    } else {
      setStreak(0);
      setShakeSignal((n) => n + 1);
      setSessionResults((prev) => ({
        ...prev,
        incorrect: prev.incorrect + 1,
        wrongQuestions: [...prev.wrongQuestions, currentQ],
      }));
    }

    const prevMastery = masteryRecords[currentQ.id];
    const updatedMastery = calculateMastery(
      prevMastery,
      currentQ.id,
      evalResult.isCorrect,
      currentInput,
      evalResult.feedbackType
    );

    const record: UserAnswerRecord = {
      questionId: currentQ.id,
      question: currentQ,
      userAnswer: currentInput,
      isCorrect: evalResult.isCorrect,
      timeSpentSeconds: timeSpent,
      evaluation: evalResult,
      timestamp: Date.now(),
    };

    onRecordAnswer(record, updatedMastery);
  };

  const handleNext = useCallback(() => {
    // Keep the on-screen keyboard open across the question swap on mobile.
    if (document.activeElement instanceof HTMLInputElement) {
      keyboardKeeper.current?.focus({ preventScroll: true });
    }
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentInput('');
      setEvaluation(null);
      setShowFeedback(false);
      setStartTime(Date.now());
    } else {
      keyboardKeeper.current?.blur();
      setFinished(true);
    }
  }, [currentIndex, queue.length]);

  const handleSwitchVariant = () => {
    if (!currentQ || showFeedback) return;
    const alternate = getAlternateSentence(currentQ);
    setQueue((prev) => {
      const copy = [...prev];
      copy[currentIndex] = alternate;
      return copy;
    });
    setVariantNonce((n) => n + 1);
    setCurrentInput('');
    setEvaluation(null);
  };

  const requestExit = useCallback(() => {
    if (answered > 0 && !finished) setConfirmExit(true);
    else onExit();
  }, [answered, finished, onExit]);

  // Keyboard: Esc to exit, Enter to continue when the field isn't focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmExit || finished) return;
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === 'Escape') {
        e.preventDefault();
        requestExit();
      } else if (e.key === 'Enter' && !typing && showFeedback && target.tagName !== 'BUTTON') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmExit, finished, showFeedback, handleNext, requestExit]);

  const title = useMemo(() => {
    if (config.label) return config.label;
    if (config.questionIds?.length) return '定向练习';
    if (config.units.length === 1) return `Unit ${config.units[0]} · ${getUnitMeta(config.units[0]).title}`;
    return `Unit ${config.units.join(' · ')} 混合练习`;
  }, [config]);

  if (queue.length === 0 || !currentQ) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <div className="card">
          <EmptyState
            cloze
            title="没有符合条件的题目"
            description="所选范围内暂时没有词汇，可以前往题库导入，或换一个单元。"
            action={
              <Button variant="primary" onClick={onExit}>
                返回首页
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <SessionSummary
        total={answered}
        correct={sessionResults.correct}
        wrong={sessionResults.wrongQuestions}
        bestStreak={bestStreak}
        seconds={Math.round((Date.now() - sessionStart.current) / 1000)}
        title={title}
        onRetest={onRetest}
        onRestart={onRestart}
        onHome={onFinish}
      />
    );
  }

  const isBookmarked = masteryRecords[currentQ.id]?.bookmarked ?? false;
  const progress = (currentIndex + (showFeedback ? 1 : 0)) / queue.length;
  const hasVariants = (SENTENCE_VARIANTS[currentQ.word.toLowerCase()]?.length ?? 0) > 0;
  const isLast = currentIndex === queue.length - 1;
  const status = showFeedback && evaluation ? (evaluation.isCorrect ? 'correct' : 'incorrect') : 'idle';

  return (
    <div className="relative min-h-[100dvh]">
      {/* Off-screen field that holds focus during question swaps (iOS keyboard continuity) */}
      <input
        ref={keyboardKeeper}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        style={{ fontSize: 16 }}
      />

      {/* ------------------------------------------------------------ Top bar */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Button variant="ghost" size="icon" onClick={requestExit} aria-label="退出练习" title="退出练习 (Esc)">
            <X className="h-[18px] w-[18px]" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <span className="hidden max-w-[220px] truncate text-[13px] font-medium text-ink-2 sm:block">{title}</span>
            <LinearProgress value={progress} className="flex-1" />
            <span className="num shrink-0 text-[13px] font-medium text-ink">
              {currentIndex + 1}
              <span className="text-ink-3"> / {queue.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <AnimatePresence>
              {streak >= 3 && (
                <motion.span
                  key="streak"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={spring.snappy}
                  className="mr-1 hidden items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[12px] font-semibold text-warning-ink sm:inline-flex"
                >
                  <Flame className="h-3 w-3" />
                  <motion.span key={streak} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="num">
                    {streak}
                  </motion.span>
                </motion.span>
              )}
            </AnimatePresence>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleBookmark(currentQ.id)}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? '取消收藏' : '收藏此词'}
              title={isBookmarked ? '取消收藏' : '收藏此词'}
            >
              <motion.span key={String(isBookmarked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.snappy}>
                <Bookmark className={`h-[17px] w-[17px] ${isBookmarked ? 'fill-warning text-warning-ink' : ''}`} />
              </motion.span>
            </Button>
            {onToggleAudio && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                onClick={onToggleAudio}
                aria-label={isAudioEnabled ? '关闭朗读' : '开启朗读'}
              >
                {isAudioEnabled ? <Volume2 className="h-[17px] w-[17px]" /> : <VolumeX className="h-[17px] w-[17px]" />}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ Question */}
      <div className="mx-auto max-w-[760px] px-5 pb-44 pt-[clamp(36px,11vh,120px)] sm:px-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${currentQ.id}-${currentIndex}-${variantNonce}`}
            variants={questionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
                <span className="eyebrow !text-ink-2">Question {String(currentIndex + 1).padStart(2, '0')}</span>
                <span>
                  Unit {currentQ.unit} · {currentQ.partOfSpeech}
                </span>
              </div>
              <div className="flex items-center">
                {hasVariants && !showFeedback && (
                  <button
                    onClick={handleSwitchVariant}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
                    title="换一个例句，考查同一个词"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">换个例句</span>
                  </button>
                )}
                <SpeakButton question={currentQ} />
              </div>
            </div>

            <ClozeLine
              question={currentQ}
              value={currentInput}
              onChange={(v) => !showFeedback && setCurrentInput(v)}
              onEnter={() => (showFeedback ? handleNext() : handleSubmit())}
              status={status}
              inputRef={inputRef}
              enterKeyHint={showFeedback ? 'next' : 'done'}
              placeholder="输入单词"
              shakeSignal={shakeSignal}
            />

            <div className="mt-5 text-[13px] text-ink-3">
              原形 <span className="font-serif text-[15px] italic text-ink-2">{currentQ.word}</span>
              {currentQ.phonetic && <span className="ml-2">{currentQ.phonetic}</span>}
            </div>

            <AnimatePresence>
              {showFeedback && evaluation && (
                <FeedbackPanel question={currentQ} evaluation={evaluation} userAnswer={currentInput} />
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ------------------------------------------------------------ Action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0 pb-safe">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4 px-5 pb-5 pt-8 sm:px-8 sm:pb-8">
          <div className="hidden items-center gap-4 text-[12.5px] text-ink-3 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Enter</span>
              {showFeedback ? (isLast ? '完成' : '下一题') : '提交'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Esc</span>退出
            </span>
          </div>
          <Button
            variant={showFeedback ? 'inverse' : 'primary'}
            size="lg"
            className="w-full sm:w-auto sm:min-w-[160px]"
            disabled={!showFeedback && !currentInput.trim()}
            onClick={() => {
              if (showFeedback) handleNext();
              else {
                handleSubmit();
                inputRef.current?.focus({ preventScroll: true });
              }
            }}
            trailing={showFeedback ? <ArrowRight /> : undefined}
            nudge
          >
            {showFeedback ? (isLast ? '完成练习' : '下一题') : '提交答案'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="结束本次练习？"
        description={`已作答的 ${answered} 题已自动保存到学习记录中。`}
        confirmLabel="结束练习"
        cancelLabel="继续练习"
        onCancel={() => {
          setConfirmExit(false);
          setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
        }}
        onConfirm={() => {
          setConfirmExit(false);
          onExit();
        }}
      />
    </div>
  );
};

/* ==========================================================================
   SessionSummary — the completion moment.
   ========================================================================== */
const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const SessionSummary: React.FC<{
  total: number;
  correct: number;
  wrong: VocabularyQuestion[];
  bestStreak: number;
  seconds: number;
  title: string;
  onRetest?: (q: VocabularyQuestion[]) => void;
  onRestart?: () => void;
  onHome: () => void;
}> = ({ total, correct, wrong, bestStreak, seconds, title, onRetest, onRestart, onHome }) => {
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  const summaryId = useRef(`summary-${Math.random().toString(36).slice(2)}`).current;
  const uniqueWrong = Array.from(new Map(wrong.map((q) => [q.id, q])).values());
  const tier =
    acc >= 90
      ? { en: 'Beautifully done.', zh: '几乎无可挑剔，这一组词你已经很稳了。', color: 'rgb(var(--success))' }
      : acc >= 70
      ? { en: 'Solid progress.', zh: '大部分都对了，把错的几个再过一遍就更稳。', color: 'rgb(var(--accent))' }
      : acc >= 40
      ? { en: 'Keep going.', zh: '每一个错误都在告诉你下一步该练什么。', color: 'rgb(var(--warning))' }
      : { en: 'Every miss is a lesson.', zh: '先把下面这些词重练一次，进步会很明显。', color: 'rgb(var(--danger))' };

  useEffect(() => {
    if (acc >= 90 && total >= 5) {
      const t = setTimeout(
        () =>
          confetti({
            particleCount: 60,
            spread: 70,
            startVelocity: 30,
            gravity: 0.9,
            scalar: 0.8,
            ticks: 160,
            origin: { y: 0.32 },
            colors: ['#4F46E5', '#8184FF', '#16915A', '#E8B252'],
            disableForReducedMotion: true,
          }),
        duration.report * 1000
      );
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statItems = [
    { label: '正确', value: correct, tone: 'text-success' },
    { label: '错误', value: total - correct, tone: total - correct > 0 ? 'text-danger' : 'text-ink' },
    { label: '最高连对', value: bestStreak, tone: 'text-ink' },
  ];

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[640px] flex-col px-5 pb-16 pt-[clamp(40px,10vh,110px)] sm:px-8">
      <motion.div variants={staggerContainer(0.08, 0.15)} initial="initial" animate="animate" className="flex flex-col items-center text-center">
        <motion.div variants={riseIn} className="eyebrow">
          {title} · 练习完成
        </motion.div>

        <motion.div variants={riseIn} className="mt-8">
          <ProgressRing value={acc / 100} size={176} stroke={8} color={tier.color} slow delay={0.2}>
            <div className="flex flex-col items-center">
              <div className="flex items-baseline">
                <AnimatedNumber id={summaryId} value={acc} duration={duration.report} className="text-[48px] font-semibold leading-none tracking-[-0.04em] text-ink" />
                <span className="ml-0.5 text-[20px] font-semibold text-ink-2">%</span>
              </div>
              <span className="mt-1.5 text-[12px] text-ink-3">正确率</span>
            </div>
          </ProgressRing>
        </motion.div>

        <motion.h2 variants={riseIn} className="mt-8 font-serif text-[34px] font-medium leading-tight tracking-[-0.02em] text-ink">
          {tier.en}
        </motion.h2>
        <motion.p variants={riseIn} className="mt-2 text-[15px] text-ink-2">
          {tier.zh}
        </motion.p>

        <motion.div variants={riseIn} className="mt-9 grid w-full grid-cols-4 divide-x divide-line rounded-xl border border-line bg-surface py-4 shadow-sm">
          {statItems.map((s) => (
            <div key={s.label} className="px-2">
              <div className={`num text-[22px] font-semibold ${s.tone}`}>{s.value}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">{s.label}</div>
            </div>
          ))}
          <div className="px-2">
            <div className="num text-[22px] font-semibold text-ink">{formatTime(seconds)}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">用时</div>
          </div>
        </motion.div>

        {uniqueWrong.length > 0 && (
          <motion.div variants={riseIn} className="mt-8 w-full text-left">
            <div className="mb-3 text-[13px] font-medium text-ink-2">需要再看一眼的词</div>
            <div className="flex flex-wrap gap-2">
              {uniqueWrong.map((q, i) => (
                <motion.span
                  key={q.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.04, duration: 0.3, ease: ease.out }}
                  className="inline-flex items-baseline gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5"
                >
                  <span className="font-serif text-[16px] italic text-ink">{q.correctAnswer}</span>
                  <span className="text-[12px] text-ink-3">{q.chineseHint}</span>
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div variants={riseIn} className="mt-10 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {uniqueWrong.length > 0 && onRetest && (
            <Button variant="primary" size="lg" leading={<RotateCcw />} onClick={() => onRetest(uniqueWrong)}>
              重练 {uniqueWrong.length} 个错词
            </Button>
          )}
          {onRestart && (
            <Button variant={uniqueWrong.length > 0 ? 'secondary' : 'primary'} size="lg" onClick={onRestart} trailing={<ArrowRight />} nudge>
              再练一组
            </Button>
          )}
          <Button variant="ghost" size="lg" leading={<Home />} onClick={onHome}>
            返回首页
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

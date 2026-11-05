import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Clock, Flag, LayoutGrid, Send, X } from 'lucide-react';
import { VocabularyQuestion, PracticeConfig, ExamSessionResult, WordMasteryRecord, Unit } from '../../types';
import {
  ActiveExamState,
  createExamPaper,
  discardAnswerKey,
  ExamPaper,
  gradeExam,
  PublicExamQuestion,
  resealExamPaper,
  selectExamQuestions,
} from '../../lib/exam';
import { saveActiveExam } from '../../utils/storage';
import { unitLabel } from '../../lib/units';
import { ClozeLine, SpeakButton } from '../sentence/SentenceClozeInput';
import { Button } from '../ui/Button';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { LinearProgress } from '../ui/DataViz';
import { EmptyState } from '../ui/Common';
import { questionVariants, spring } from '../../lib/motion';

interface ExamSessionProps {
  questions: VocabularyQuestion[];
  units: Unit[];
  config: PracticeConfig;
  masteryRecords?: Record<string, WordMasteryRecord>;
  /** Resume a persisted in-progress exam (after refresh). */
  resume?: ActiveExamState | null;
  onFinishExam: (result: ExamSessionResult) => void;
  onExit: () => void;
}

export const ExamSession: React.FC<ExamSessionProps> = ({ questions, units, config, resume, onFinishExam, onExit }) => {
  // The paper holds ONLY public data. The answer key is sealed inside lib/exam.
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const deadlineRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refs mirror state so the timer's auto-submit always grades the latest answers.
  const answersRef = useRef(userAnswers);
  answersRef.current = userAnswers;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const handleSubmitExam = useCallback(() => {
    const p = paperRef.current;
    if (submittedRef.current || !p) return;
    submittedRef.current = true;
    saveActiveExam(null);
    try {
      onFinishExam(gradeExam({ paper: p, answers: answersRef.current, startedAt: startedAtRef.current, config, units }));
    } catch (e) {
      submittedRef.current = false;
      setResumeNotice((e as Error).message);
    }
  }, [config, units, onFinishExam]);

  // Build (or resume) the paper once.
  useEffect(() => {
    submittedRef.current = false;
    if (resume && resume.paper) {
      const { paper: p, missing } = resealExamPaper(resume.paper, questions);
      setPaper(p);
      setUserAnswers(resume.answers || {});
      setFlagged(resume.flagged || {});
      setCurrentIndex(Math.min(resume.currentIndex || 0, Math.max(0, p.questions.length - 1)));
      startedAtRef.current = resume.startedAt;
      deadlineRef.current = resume.deadline;
      setResumeNotice(
        missing > 0
          ? `已恢复未完成的考试。${missing} 道题因题库中已被删除而移除。`
          : '已恢复未完成的考试，作答与剩余时间均已保留。'
      );
    } else {
      const selected = selectExamQuestions(questions, config);
      const p = createExamPaper(selected);
      setPaper(p);
      setUserAnswers({});
      setFlagged({});
      setCurrentIndex(0);
      startedAtRef.current = Date.now();
      deadlineRef.current = config.timed ? startedAtRef.current + (config.timeLimitMinutes || 15) * 60_000 : null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clock — derived from a fixed deadline so a refresh never resets the timer.
  useEffect(() => {
    if (!paper || deadlineRef.current === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (deadlineRef.current !== null && n >= deadlineRef.current) {
        clearInterval(t);
        handleSubmitExam();
      }
    }, 1000);
    if (Date.now() >= deadlineRef.current) handleSubmitExam();
    return () => clearInterval(t);
  }, [paper, handleSubmitExam]);

  // Persist progress (public paper + own answers only).
  useEffect(() => {
    if (!paper || submittedRef.current || paper.questions.length === 0) return;
    const state: ActiveExamState = {
      version: 1,
      paper,
      config,
      answers: userAnswers,
      flagged,
      currentIndex,
      startedAt: startedAtRef.current,
      deadline: deadlineRef.current,
      savedAt: Date.now(),
    };
    saveActiveExam(state);
  }, [paper, userAnswers, flagged, currentIndex, config]);

  const examQuestions = paper?.questions ?? [];
  const questionsRef = useRef(examQuestions);
  questionsRef.current = examQuestions;

  const go = useCallback(
    (i: number) => setCurrentIndex(Math.max(0, Math.min(questionsRef.current.length - 1, i))),
    []
  );

  // Keyboard: Esc exit · ←/→ navigate (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSubmitModal || showExitModal || sheetOpen) return;
      const typing = (e.target as HTMLElement).tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowExitModal(true);
      } else if (!typing && e.key === 'ArrowRight') go(currentIndex + 1);
      else if (!typing && e.key === 'ArrowLeft') go(currentIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, go, showSubmitModal, showExitModal, sheetOpen]);

  if (!paper) return null;

  if (examQuestions.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-24">
        <div className="card">
          <EmptyState
            cloze
            title="没有符合考试条件的试题"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  saveActiveExam(null);
                  discardAnswerKey(paper.examId);
                  onExit();
                }}
              >
                返回首页
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const currentQ = examQuestions[currentIndex];
  const answeredCount = examQuestions.filter((q) => userAnswers[q.questionId]?.trim()).length;
  const unansweredCount = examQuestions.length - answeredCount;
  const flaggedCount = examQuestions.filter((q) => flagged[q.questionId]).length;
  const timeRemainingSeconds = deadlineRef.current === null ? 0 : Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
  const unitNames = config.unitIds.map((id) => unitLabel(units, id));
  const minutes = Math.floor(timeRemainingSeconds / 60);
  const seconds = timeRemainingSeconds % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeCritical = deadlineRef.current !== null && timeRemainingSeconds <= 120;
  const isLast = currentIndex === examQuestions.length - 1;

  const sheet = (
    <AnswerSheet
      questions={examQuestions}
      answers={userAnswers}
      flagged={flagged}
      current={currentIndex}
      onPick={(i) => {
        go(i);
        setSheetOpen(false);
      }}
    />
  );

  return (
    <div className="relative min-h-[100dvh]">
      {/* ------------------------------------------------------------ Top bar */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Button variant="ghost" size="icon" onClick={() => setShowExitModal(true)} aria-label="退出考试">
            <X className="h-[18px] w-[18px]" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <span className="hidden truncate text-[13px] font-medium text-ink-2 sm:block">
              模拟考试 · {unitNames.join(' · ')}
            </span>
            <LinearProgress value={answeredCount / examQuestions.length} className="flex-1" />
            <span className="num shrink-0 text-[13px] text-ink-2">
              已答 <span className="font-medium text-ink">{answeredCount}</span>/{examQuestions.length}
            </span>
          </div>
          {deadlineRef.current !== null && (
            <span
              className={`num inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                isTimeCritical ? 'bg-danger-soft text-danger' : 'bg-sunken text-ink'
              }`}
              aria-live={isTimeCritical ? 'polite' : 'off'}
              aria-label={`剩余时间 ${timerStr}`}
            >
              <Clock className="h-3.5 w-3.5" />
              {timerStr}
            </span>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowSubmitModal(true)} leading={<Send />} className="hidden sm:inline-flex">
            交卷
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1120px] gap-10 px-5 pb-44 pt-[clamp(32px,9vh,96px)] sm:px-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* ------------------------------------------------------------ Question */}
        <div className="min-w-0">
          <AnimatePresence>
            {resumeNotice && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-8 flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 shadow-xs"
                role="status"
              >
                <span>{resumeNotice}</span>
                <button onClick={() => setResumeNotice(null)} className="text-ink-3 hover:text-ink" aria-label="关闭提示">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={currentQ.questionId + currentIndex} variants={questionVariants} initial="initial" animate="animate" exit="exit">
              <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
                <div className="flex items-center gap-x-2.5 text-[12.5px] text-ink-3">
                  <span className="eyebrow !text-ink-2">
                    Question {String(currentIndex + 1).padStart(2, '0')}
                  </span>
                  <span>{unitLabel(units, currentQ.unitId)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFlagged((p) => ({ ...p, [currentQ.questionId]: !p[currentQ.questionId] }))}
                    aria-pressed={!!flagged[currentQ.questionId]}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors ${
                      flagged[currentQ.questionId] ? 'bg-warning-soft text-warning-ink' : 'text-ink-3 hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    <motion.span key={String(!!flagged[currentQ.questionId])} initial={{ rotate: -20, scale: 0.7 }} animate={{ rotate: 0, scale: 1 }} transition={spring.snappy}>
                      <Flag className={`h-3.5 w-3.5 ${flagged[currentQ.questionId] ? 'fill-current' : ''}`} />
                    </motion.span>
                    {flagged[currentQ.questionId] ? '已标记' : '标记存疑'}
                  </button>
                  <SpeakButton text={currentQ.sentence.replace('_____', 'blank')} />
                </div>
              </div>

              <ClozeLine
                question={currentQ}
                value={userAnswers[currentQ.questionId] || ''}
                onChange={(val) => setUserAnswers((prev) => ({ ...prev, [currentQ.questionId]: val }))}
                onEnter={() => (isLast ? setShowSubmitModal(true) : go(currentIndex + 1))}
                inputRef={inputRef}
                enterKeyHint={isLast ? 'done' : 'next'}
                placeholder="输入单词"
              />
              <p className="mt-8 text-[12.5px] text-ink-3">考试过程中不显示对错、原形或解析，交卷后统一评分。</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ------------------------------------------------------------ Desktop answer sheet */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-line bg-surface p-5 shadow-sm">{sheet}</div>
        </aside>
      </div>

      {/* ------------------------------------------------------------ Action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0 pb-safe">
        <div className="mx-auto flex max-w-[1120px] items-center gap-2 px-5 pb-5 pt-8 sm:px-8 sm:pb-8 lg:pr-[calc(260px+4.5rem)]">
          <Button variant="secondary" size="lg" className="lg:hidden !px-3.5" onClick={() => setSheetOpen(true)} aria-label="答题卡">
            <LayoutGrid className="h-4 w-4" />
            <span className="num text-[13px]">{currentIndex + 1}/{examQuestions.length}</span>
          </Button>
          <div className="hidden items-center gap-4 text-[12.5px] text-ink-3 lg:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">Enter</span>下一题
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="kbd">←</span>
              <span className="kbd">→</span>切换
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={() => go(currentIndex - 1)} disabled={currentIndex === 0} aria-label="上一题" className="!px-3.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {isLast ? (
              <Button variant="primary" size="lg" onClick={() => setShowSubmitModal(true)} leading={<Send />}>
                交卷
              </Button>
            ) : (
              <Button variant="inverse" size="lg" onClick={() => go(currentIndex + 1)} trailing={<ArrowRight />} nudge>
                下一题
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile answer sheet */}
      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="答题卡" size="md">
        {sheet}
        <Button variant="primary" size="lg" className="mt-6 w-full" leading={<Send />} onClick={() => { setSheetOpen(false); setShowSubmitModal(true); }}>
          交卷评分
        </Button>
      </Modal>

      {/* Submit */}
      <ConfirmDialog
        open={showSubmitModal}
        title="确认交卷？"
        description={
          unansweredCount > 0
            ? `还有 ${unansweredCount} 题未作答，未作答的题目按错误计分。`
            : '全部题目都已作答，交卷后立即评分并生成诊断报告。'
        }
        confirmLabel="确认交卷"
        cancelLabel="继续答题"
        onCancel={() => setShowSubmitModal(false)}
        onConfirm={() => {
          setShowSubmitModal(false);
          handleSubmitExam();
        }}
      >
        <div className="grid grid-cols-3 divide-x divide-line rounded-lg bg-sunken py-3 text-center">
          <div>
            <div className="num text-[20px] font-semibold text-ink">{answeredCount}</div>
            <div className="text-[12px] text-ink-3">已作答</div>
          </div>
          <div>
            <div className={`num text-[20px] font-semibold ${unansweredCount ? 'text-warning-ink' : 'text-ink'}`}>{unansweredCount}</div>
            <div className="text-[12px] text-ink-3">未作答</div>
          </div>
          <div>
            <div className="num text-[20px] font-semibold text-ink">{flaggedCount}</div>
            <div className="text-[12px] text-ink-3">存疑</div>
          </div>
        </div>
      </ConfirmDialog>

      {/* Exit */}
      <ConfirmDialog
        open={showExitModal}
        title="放弃本场考试？"
        description="退出后本场试卷不会保存成绩。"
        confirmLabel="放弃并退出"
        cancelLabel="继续考试"
        tone="danger"
        onCancel={() => setShowExitModal(false)}
        onConfirm={() => {
          setShowExitModal(false);
          submittedRef.current = true;
          saveActiveExam(null);
          discardAnswerKey(paper.examId);
          onExit();
        }}
      />
    </div>
  );
};

const AnswerSheet: React.FC<{
  questions: PublicExamQuestion[];
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  current: number;
  onPick: (i: number) => void;
}> = ({ questions, answers, flagged, current, onPick }) => (
  <div>
    <div className="mb-4 flex items-center justify-between">
      <span className="text-[13px] font-semibold text-ink">答题卡</span>
      <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-[3px] bg-ink" />已答
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-warning" />存疑
        </span>
      </div>
    </div>
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
      {questions.map((q, i) => {
        const has = Boolean(answers[q.questionId]?.trim());
        const isCur = i === current;
        return (
          <button
            key={q.questionId}
            onClick={() => onPick(i)}
            aria-label={`第 ${i + 1} 题${has ? '，已作答' : ''}${flagged[q.questionId] ? '，存疑' : ''}`}
            aria-current={isCur ? 'step' : undefined}
            className={`num relative flex h-9 items-center justify-center rounded-md text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-hover ${
              has ? 'bg-ink text-canvas' : 'bg-sunken text-ink-2 hover:bg-line'
            } ${isCur ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface dark:ring-offset-elevated' : ''}`}
          >
            {i + 1}
            {flagged[q.questionId] && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-surface" />}
          </button>
        );
      })}
    </div>
  </div>
);

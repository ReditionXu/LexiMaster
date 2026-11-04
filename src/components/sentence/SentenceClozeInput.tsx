import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { AlertCircle, Check, ChevronDown, Lightbulb, Volume2, X } from 'lucide-react';
import { VocabularyQuestion, AnswerEvaluation } from '../../types';
import { speech } from '../../utils/audio';
import { commonPrefixLength, splitSentence } from '../../lib/insights';
import { duration, ease, shake, spring } from '../../lib/motion';

/* ==========================================================================
   ClozeLine — the sentence, with the answer field living inside the prose.
   ========================================================================== */
export type ClozeStatus = 'idle' | 'correct' | 'incorrect';

interface ClozeLineProps {
  question: VocabularyQuestion;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  status?: ClozeStatus;
  readOnly?: boolean;
  size?: 'lg' | 'md';
  autoFocus?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  enterKeyHint?: 'done' | 'next' | 'go' | 'send';
  /** Increment to trigger the gentle "incorrect" shake. */
  shakeSignal?: number;
  className?: string;
}

export const ClozeLine: React.FC<ClozeLineProps> = ({
  question,
  value,
  onChange,
  onEnter,
  status = 'idle',
  readOnly,
  size = 'lg',
  autoFocus = true,
  placeholder = '',
  inputRef: externalRef,
  enterKeyHint = 'done',
  shakeSignal = 0,
  className = '',
}) => {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = (externalRef as React.RefObject<HTMLInputElement>) ?? localRef;
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const controls = useAnimationControls();
  const { before, after } = splitSentence(question.sentence);

  // Measure the typed word so the field grows with it — no fixed-width box.
  useLayoutEffect(() => {
    if (mirrorRef.current) setWidth(mirrorRef.current.offsetWidth);
  }, [value, placeholder, size]);

  useEffect(() => {
    if (!autoFocus || readOnly) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, question.sentence, autoFocus]);

  useEffect(() => {
    if (shakeSignal > 0) controls.start(shake);
  }, [shakeSignal, controls]);

  const tone =
    status === 'correct' ? 'text-success' : status === 'incorrect' ? 'text-danger' : 'text-accent';
  const lineColor =
    status === 'correct' ? 'bg-success' : status === 'incorrect' ? 'bg-danger' : 'bg-accent';
  const active = focused || status !== 'idle';
  const minCh = size === 'lg' ? 5.5 : 5;

  return (
    <p
      className={`font-serif text-ink ${
        size === 'lg' ? 'text-sentence' : 'text-[19px] sm:text-[21px] leading-[1.7]'
      } [text-wrap:pretty] break-words ${className}`}
    >
      <span>{before}</span>
      <motion.span animate={controls} className="relative mx-[0.12em] inline-flex items-baseline whitespace-nowrap align-baseline">
        <span className="relative inline-block">
          {/* soft focus wash */}
          <span
            aria-hidden
            className={`pointer-events-none absolute -inset-x-1 -bottom-[3px] top-[30%] rounded-t-[4px] transition-opacity duration-300 ${
              status === 'correct'
                ? 'bg-gradient-to-t from-success/[0.10] to-success/0 opacity-100'
                : status === 'incorrect'
                ? 'bg-gradient-to-t from-danger/[0.10] to-danger/0 opacity-100'
                : 'bg-gradient-to-t from-accent/[0.09] to-accent/0 ' + (focused ? 'opacity-100' : 'opacity-0')
            }`}
          />
          {/* hidden mirror for width */}
          <span
            ref={mirrorRef}
            aria-hidden
            className="invisible absolute left-0 top-0 whitespace-pre font-serif italic font-medium px-1"
            style={{ minWidth: `${minCh}em` }}
          >
            {value || placeholder || ' '}
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint={enterKeyHint}
            aria-label={`填写单词，提示：${question.chineseHint}`}
            readOnly={readOnly}
            value={value}
            placeholder={placeholder}
            onFocus={(e) => {
              setFocused(true);
              // Keep the field clear of the on-screen keyboard on phones.
              if (window.matchMedia('(max-width: 640px)').matches) {
                const el = e.currentTarget;
                setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
              }
            }}
            onBlur={() => setFocused(false)}
            onChange={(e) => !readOnly && onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onEnter();
              }
            }}
            style={{ width: width ? width + 2 : `${minCh}em`, maxWidth: 'min(70vw, 16em)' }}
            className={`relative bg-transparent px-1 text-center font-serif italic font-medium outline-none placeholder:not-italic placeholder:font-sans placeholder:text-[0.62em] placeholder:font-normal placeholder:text-ink-3 caret-accent transition-[width,color] duration-150 ease-out ${tone} ${
              readOnly ? 'cursor-default' : ''
            }`}
          />
          {/* baseline + growing accent line */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-[3px] h-[2px] rounded-full bg-line-strong" />
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 -bottom-[3px] h-[2px] origin-center rounded-full ${lineColor} transition-transform duration-300 ease-out ${
              active ? 'scale-x-100' : 'scale-x-0'
            }`}
          />
        </span>

        {/* result glyph */}
        <AnimatePresence>
          {status !== 'idle' && (
            <motion.span
              key={status}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.snappy}
              className={`ml-1 inline-flex h-[0.95em] w-[0.95em] translate-y-[0.12em] items-center justify-center self-center rounded-full ${
                status === 'correct' ? 'bg-success text-white' : 'bg-danger text-white'
              }`}
            >
              {status === 'correct' ? (
                <svg viewBox="0 0 24 24" className="h-[0.6em] w-[0.6em]">
                  <motion.path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.32, ease: ease.out, delay: 0.06 }}
                  />
                </svg>
              ) : (
                <X className="h-[0.58em] w-[0.58em]" strokeWidth={3.2} />
              )}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Chinese hint, attached to the blank */}
        <span
          className={`ml-1.5 inline-flex translate-y-[-0.12em] items-center self-center rounded-full px-2 py-[1px] font-sans text-[0.56em] font-medium not-italic leading-[1.6] tracking-normal select-none transition-colors duration-300 ${
            status === 'correct'
              ? 'bg-success-soft text-success'
              : status === 'incorrect'
              ? 'bg-danger-soft text-danger'
              : 'bg-accent-soft text-accent'
          }`}
        >
          {question.chineseHint}
        </span>
      </motion.span>
      <span>{after}</span>
    </p>
  );
};

/* ==========================================================================
   AnswerDiff — shows where the attempt diverged from the answer.
   ========================================================================== */
export const AnswerDiff: React.FC<{ user: string; correct: string }> = ({ user, correct }) => {
  const p = commonPrefixLength(user, correct);
  const u = user.trim();
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-[20px]">
      <span className="text-ink-3 line-through decoration-danger/60 decoration-[1.5px]">
        {u ? (
          <>
            {u.slice(0, p)}
            <span className="text-danger">{u.slice(p) || ''}</span>
          </>
        ) : (
          <span className="font-sans text-sm no-underline">（未填写）</span>
        )}
      </span>
      <span className="font-sans text-ink-3 text-sm">→</span>
      <span className="italic font-medium text-success">
        {correct.slice(0, p)}
        <span className="rounded-[4px] bg-success/[0.12] px-[2px]">{correct.slice(p)}</span>
      </span>
    </div>
  );
};

/* ==========================================================================
   FeedbackPanel — result, the answer, and the grammar explanation.
   ========================================================================== */
interface FeedbackPanelProps {
  question: VocabularyQuestion;
  evaluation: AnswerEvaluation;
  userAnswer: string;
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ question, evaluation, userAnswer }) => {
  const correct = evaluation.isCorrect;
  const isTrap = evaluation.feedbackType === 'base_form_trap';
  const [open, setOpen] = useState(!correct);
  const explanation = question.explanation || question.grammarNote;
  const others = question.acceptedAnswers.filter(
    (a) => a.toLowerCase() !== question.correctAnswer.toLowerCase()
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.feedback, ease: ease.out, delay: correct ? 0.05 : 0.18 }}
      className="mt-8"
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-xl border p-5 sm:p-6 ${
          correct ? 'border-success/20 bg-success-soft/60' : 'border-line bg-surface shadow-sm'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              correct ? 'bg-success/15 text-success' : isTrap ? 'bg-warning-soft text-warning-ink' : 'bg-danger-soft text-danger'
            }`}
          >
            {correct ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : isTrap ? <AlertCircle className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[15px] font-semibold text-ink">{evaluation.title}</h4>
              {isTrap && (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-medium text-warning-ink">原形陷阱</span>
              )}
              {question.grammarNote && (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11.5px] font-medium text-ink-2">
                  {question.grammarNote}
                </span>
              )}
            </div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{evaluation.message}</p>

            {!correct && (
              <div className="mt-4 rounded-lg bg-sunken/70 px-4 py-3">
                <AnswerDiff user={userAnswer} correct={question.correctAnswer} />
                {others.length > 0 && (
                  <p className="mt-1.5 text-[12.5px] text-ink-3">
                    也可接受：<span className="font-serif italic text-ink-2">{others.join(' / ')}</span>
                  </p>
                )}
              </div>
            )}

            {(explanation || question.collocation) && (
              <div className="mt-3">
                <button
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  className="group inline-flex items-center gap-1.5 rounded-md py-1 text-[13px] font-medium text-ink-2 hover:text-ink"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  语法解析
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: ease.out }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                        {explanation && <p>{explanation}</p>}
                        {question.collocation && (
                          <p>
                            <span className="text-ink-3">常见搭配 </span>
                            <span className="font-serif italic text-ink">{question.collocation}</span>
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ==========================================================================
   SpeakButton
   ========================================================================== */
export const SpeakButton: React.FC<{ question: VocabularyQuestion; className?: string; label?: boolean }> = ({
  question,
  className = '',
  label,
}) => (
  <button
    type="button"
    onClick={() => speech.speak(question.sentence.replace('_____', question.correctAnswer))}
    title="朗读完整句子"
    aria-label="朗读完整句子"
    className={`inline-flex items-center gap-1.5 rounded-md text-ink-3 transition-colors hover:text-ink ${
      label ? 'h-8 px-2 text-[13px]' : 'h-9 w-9 justify-center hover:bg-sunken'
    } ${className}`}
  >
    <Volume2 className="h-4 w-4" />
    {label && '朗读'}
  </button>
);

/* ==========================================================================
   Backwards-compatible wrapper (kept for any external usage).
   ========================================================================== */
interface SentenceClozeInputProps {
  question: VocabularyQuestion;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onNext?: () => void;
  evaluation?: AnswerEvaluation | null;
  showFeedback?: boolean;
  placeholder?: string;
}

export const SentenceClozeInput: React.FC<SentenceClozeInputProps> = ({
  question,
  value,
  onChange,
  onSubmit,
  onNext,
  evaluation,
  showFeedback,
  placeholder,
}) => (
  <div>
    <ClozeLine
      question={question}
      value={value}
      onChange={onChange}
      onEnter={() => (showFeedback ? onNext?.() : onSubmit())}
      status={showFeedback && evaluation ? (evaluation.isCorrect ? 'correct' : 'incorrect') : 'idle'}
      readOnly={showFeedback}
      placeholder={placeholder}
    />
    {showFeedback && evaluation && <FeedbackPanel question={question} evaluation={evaluation} userAnswer={value} />}
  </div>
);

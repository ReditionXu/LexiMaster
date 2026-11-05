import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Bookmark, ChevronDown, NotebookPen, Play, RotateCcw } from 'lucide-react';
import { VocabularyQuestion, WordMasteryRecord, PracticeConfig } from '../../types';
import { relativeTime, splitSentence } from '../../lib/insights';
import { activeUnits, unitLabel } from '../../lib/units';
import type { Unit } from '../../types';
import { ease, spring } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { EmptyState, MasteryBadge, PageHeader } from '../ui/Common';
import { SpeakButton } from '../sentence/SentenceClozeInput';

interface MistakeReviewProps {
  questions: VocabularyQuestion[];
  units: Unit[];
  masteryRecords: Record<string, WordMasteryRecord>;
  onStartPractice: (config: PracticeConfig) => void;
  onToggleBookmark: (wordId: string) => void;
}

type MasteryFilter = 'all' | 'weak' | 'learning' | 'bookmarked';
type SortKey = 'errorCount' | 'recent' | 'unit';

export const MistakeReview: React.FC<MistakeReviewProps> = ({
  questions,
  units: allUnits,
  masteryRecords,
  onStartPractice,
  onToggleBookmark,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedMastery, setSelectedMastery] = useState<MasteryFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('errorCount');
  const [openId, setOpenId] = useState<string | null>(null);
  const unitList = activeUnits(allUnits);

  // A word belongs in the notebook if it has ever been answered incorrectly (same rule as before).
  const allMistakes = useMemo(
    () =>
      questions.filter((q) => {
        const rec = masteryRecords[q.id];
        if (!rec) return false;
        return (rec.errorHistory && rec.errorHistory.length > 0) || rec.totalAttempts - rec.correctAttempts > 0;
      }),
    [questions, masteryRecords]
  );

  const filtered = allMistakes.filter((q) => {
    const rec = masteryRecords[q.id];
    if (selectedUnit !== 'all' && q.unitId !== selectedUnit) return false;
    if (selectedMastery === 'weak' && rec.masteryLevel !== 'weak') return false;
    if (selectedMastery === 'learning' && rec.masteryLevel !== 'learning') return false;
    if (selectedMastery === 'bookmarked' && !rec.bookmarked) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const recA = masteryRecords[a.id];
    const recB = masteryRecords[b.id];
    const errorsA = (recA?.totalAttempts || 0) - (recA?.correctAttempts || 0);
    const errorsB = (recB?.totalAttempts || 0) - (recB?.correctAttempts || 0);
    if (sortBy === 'errorCount') return errorsB - errorsA;
    if (sortBy === 'recent') return (recB?.lastAttemptTime || 0) - (recA?.lastAttemptTime || 0);
    const oa = allUnits.find((u) => u.id === a.unitId)?.order ?? 0;
    const ob = allUnits.find((u) => u.id === b.unitId)?.order ?? 0;
    return oa - ob;
  });

  const practiceWords = (list: VocabularyQuestion[], label: string) => {
    if (list.length === 0) return;
    onStartPractice({
      mode: 'practice',
      unitIds: Array.from(new Set(list.map((q) => q.unitId))),
      questionCount: list.length,
      order: 'weakest-first',
      timed: false,
      questionIds: list.map((q) => q.id),
      label,
    });
  };

  const weakTotal = allMistakes.filter((q) => masteryRecords[q.id]?.masteryLevel === 'weak').length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mistake notebook"
        title="错题本"
        description="按错误次数排列。答对一次不等于掌握——多次出错的词会在练习中优先出现，直到连续答对。"
        actions={
          <Button
            variant="primary"
            size="lg"
            disabled={sorted.length === 0}
            leading={<RotateCcw />}
            onClick={() => practiceWords(sorted, '错题强化')}
          >
            强化当前 {sorted.length} 词
          </Button>
        }
      />

      {allMistakes.length > 0 && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Segmented
              value={selectedUnit}
              onChange={setSelectedUnit}
              ariaLabel="单元"
              options={[
                { value: 'all', label: '全部单元' },
                ...unitList.map((u) => ({ value: u.id, label: u.name })),
              ]}
            />
          </div>
          <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Segmented
              value={selectedMastery}
              onChange={setSelectedMastery}
              ariaLabel="掌握度"
              options={[
                { value: 'all', label: '全部' },
                { value: 'weak', label: '待强化', count: weakTotal },
                { value: 'learning', label: '学习中' },
                { value: 'bookmarked', label: '收藏' },
              ]}
            />
            <label className="relative">
              <span className="sr-only">排序</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-8 appearance-none rounded-md border border-line bg-surface pl-3 pr-8 text-[12.5px] font-medium text-ink-2 outline-none transition-colors hover:border-line-strong focus:border-accent/50"
              >
                <option value="errorCount">错误最多</option>
                <option value="recent">最近练习</option>
                <option value="unit">按单元</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-ink-3" />
            </label>
          </div>
        </div>
      )}

      {allMistakes.length === 0 ? (
        <div className="card">
          <EmptyState
            cloze
            title="错题本还是空的"
            description="完成一次练习或模拟考试后，答错过的词会自动收录到这里，并附上你最近一次的错误写法。"
          />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card">
          <EmptyState icon={<NotebookPen />} title="当前筛选下没有词" description="换一个单元或掌握度试试。" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_88px_112px_132px] items-center gap-4 border-b border-line px-6 py-3 text-[12px] font-medium text-ink-3 md:grid">
            <span>单词</span>
            <span>最近错误写法</span>
            <span className="text-right">错误</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <motion.ul layout className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {sorted.map((q) => (
                <MistakeRow
                  key={q.id}
                  unitName={unitLabel(allUnits, q.unitId)}
                  q={q}
                  rec={masteryRecords[q.id]}
                  open={openId === q.id}
                  onToggle={() => setOpenId((id) => (id === q.id ? null : q.id))}
                  onBookmark={() => onToggleBookmark(q.id)}
                  onPractice={() => practiceWords([q], `重练 · ${q.word}`)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      )}
    </div>
  );
};

const MistakeRow: React.FC<{
  q: VocabularyQuestion;
  unitName: string;
  rec: WordMasteryRecord;
  open: boolean;
  onToggle: () => void;
  onBookmark: () => void;
  onPractice: () => void;
}> = ({ q, unitName, rec, open, onToggle, onBookmark, onPractice }) => {
  const errors = rec.totalAttempts - rec.correctAttempts;
  const lastError = rec.errorHistory?.[rec.errorHistory.length - 1];
  const { before, after } = splitSentence(q.sentence);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2 }}
      className={open ? 'bg-sunken/40' : ''}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_88px_112px_132px] md:px-6">
        <button onClick={onToggle} aria-expanded={open} className="group flex min-w-0 items-center gap-3 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:text-ink ${open ? 'rotate-180' : '-rotate-90'}`} />
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-serif text-[19px] font-medium text-ink">{q.word}</span>
              <span className="truncate text-[13px] text-ink-2">{q.chineseHint}</span>
            </span>
            <span className="block text-[12px] text-ink-3">
              {unitName} · {relativeTime(rec.lastAttemptTime)}
            </span>
          </span>
        </button>

        <div className="hidden min-w-0 md:block">
          {lastError?.userAnswer ? (
            <span className="font-serif text-[16px] italic text-danger line-through decoration-danger/40">{lastError.userAnswer}</span>
          ) : (
            <span className="text-[13px] text-ink-3">—</span>
          )}
          <span className="mx-1.5 text-[12px] text-ink-3">→</span>
          <span className="font-serif text-[16px] italic text-success">{q.correctAnswer}</span>
        </div>

        <div className="hidden text-right md:block">
          <span className="num text-[15px] font-semibold text-ink">{errors}</span>
          <span className="num text-[12px] text-ink-3"> / {rec.totalAttempts}</span>
        </div>

        <div className="hidden md:block">
          <MasteryBadge level={rec.masteryLevel} />
        </div>

        <div className="flex items-center justify-end gap-1">
          <span className="mr-1 md:hidden">
            <MasteryBadge level={rec.masteryLevel} />
          </span>
          <button
            onClick={onBookmark}
            aria-pressed={!!rec.bookmarked}
            aria-label={rec.bookmarked ? '取消收藏' : '收藏'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
          >
            <motion.span key={String(!!rec.bookmarked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.snappy}>
              <Bookmark className={`h-4 w-4 ${rec.bookmarked ? 'fill-warning text-warning-ink' : ''}`} />
            </motion.span>
          </button>
          <Button size="sm" variant="secondary" onClick={onPractice} leading={<Play />} className="hidden sm:inline-flex">
            重练
          </Button>
          <Button size="icon-sm" variant="secondary" onClick={onPractice} aria-label="重练" className="sm:hidden">
            <Play className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-5 pb-6 md:pl-[52px] md:pr-6">
              <p className="font-serif text-[18px] leading-[1.7] text-ink">
                {before}
                <span className="mx-0.5 italic font-medium text-success underline decoration-success/40 decoration-[1.5px] underline-offset-4">
                  {q.correctAnswer}
                </span>
                {after}
              </p>
              <div className="grid gap-4 text-[13.5px] leading-relaxed sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5 text-ink-2">
                  {q.grammarNote && <div className="font-medium text-ink">{q.grammarNote}</div>}
                  <p>{q.explanation}</p>
                  {q.collocation && (
                    <p>
                      <span className="text-ink-3">搭配 </span>
                      <span className="font-serif italic text-ink">{q.collocation}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-start">
                  <SpeakButton question={q} label />
                </div>
              </div>
              {rec.errorHistory?.length > 0 && (
                <div>
                  <div className="mb-2 text-[12px] text-ink-3">错误记录</div>
                  <div className="flex flex-wrap gap-1.5">
                    {rec.errorHistory.slice(-8).reverse().map((e, i) => (
                      <span key={i} className="rounded-md border border-line bg-surface px-2 py-0.5 font-serif text-[14px] italic text-ink-2">
                        {e.userAnswer || '（空）'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" variant="ghost" trailing={<ArrowRight />} nudge onClick={onPractice} className="-ml-3">
                单独练习这个词
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
};

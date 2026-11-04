import type {
  MasteryLevel,
  UserAnswerRecord,
  VocabularyQuestion,
  WordMasteryRecord,
} from '../types';

/** Presentation-only helpers. They read data; they never change scoring or mastery logic. */

export interface UnitMetrics {
  unit: number;
  total: number;
  practiced: number;
  mastered: number;
  familiar: number;
  learning: number;
  weak: number;
  accuracy: number; // 0-100, attempt-weighted
  coverage: number; // 0-1
  masteryRatio: number; // (mastered + familiar*0.5) / total, 0-1
  lastPracticed: number | null;
}

export function getUnitMetrics(
  questions: VocabularyQuestion[],
  records: Record<string, WordMasteryRecord>,
  unit: number | number[]
): UnitMetrics {
  const units = Array.isArray(unit) ? unit : [unit];
  const pool = questions.filter((q) => units.includes(q.unit));
  let practiced = 0,
    mastered = 0,
    familiar = 0,
    learning = 0,
    weak = 0,
    attempts = 0,
    correct = 0;
  let last: number | null = null;

  for (const q of pool) {
    const r = records[q.id];
    if (!r || r.totalAttempts === 0) continue;
    practiced++;
    attempts += r.totalAttempts;
    correct += r.correctAttempts;
    if (r.masteryLevel === 'mastered') mastered++;
    else if (r.masteryLevel === 'familiar') familiar++;
    else if (r.masteryLevel === 'weak') weak++;
    else learning++;
    if (!last || r.lastAttemptTime > last) last = r.lastAttemptTime;
  }

  const total = pool.length;
  return {
    unit: units[0],
    total,
    practiced,
    mastered,
    familiar,
    learning,
    weak,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
    coverage: total > 0 ? practiced / total : 0,
    masteryRatio: total > 0 ? (mastered + familiar * 0.5) / total : 0,
    lastPracticed: last,
  };
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Daily answer counts for the last `days` days (oldest → newest). */
export function getDailyActivity(history: UserAnswerRecord[], days: number) {
  const today = startOfDay(Date.now());
  const buckets = Array.from({ length: days }, (_, i) => ({
    date: today - (days - 1 - i) * DAY,
    total: 0,
    correct: 0,
  }));
  const first = buckets[0].date;
  for (const h of history) {
    if (!h.timestamp || h.timestamp < first) continue;
    const idx = Math.floor((startOfDay(h.timestamp) - first) / DAY);
    if (idx >= 0 && idx < days) {
      buckets[idx].total++;
      if (h.isCorrect) buckets[idx].correct++;
    }
  }
  return buckets;
}

/** Consecutive days (ending today or yesterday) with at least one answer. */
export function getStreakDays(history: UserAnswerRecord[]) {
  if (history.length === 0) return 0;
  const days = new Set(history.map((h) => startOfDay(h.timestamp)));
  let cursor = startOfDay(Date.now());
  if (!days.has(cursor)) cursor -= DAY;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

export function relativeTime(ts: number | null): string {
  if (!ts) return '尚未练习';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const dayDiff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (dayDiff === 0) return `今天 ${new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (dayDiff === 1) return '昨天';
  if (dayDiff < 7) return `${dayDiff} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export const MASTERY_META: Record<
  MasteryLevel,
  { label: string; en: string; color: string; soft: string; text: string; dot: string }
> = {
  mastered: {
    label: '已掌握',
    en: 'Mastered',
    color: 'rgb(var(--success))',
    soft: 'bg-success-soft',
    text: 'text-success',
    dot: 'bg-success',
  },
  familiar: {
    label: '基本掌握',
    en: 'Familiar',
    color: 'rgb(var(--accent))',
    soft: 'bg-accent-soft',
    text: 'text-accent',
    dot: 'bg-accent',
  },
  learning: {
    label: '学习中',
    en: 'Learning',
    color: 'rgb(var(--warning))',
    soft: 'bg-warning-soft',
    text: 'text-warning-ink',
    dot: 'bg-warning',
  },
  weak: {
    label: '待强化',
    en: 'Weak',
    color: 'rgb(var(--danger))',
    soft: 'bg-danger-soft',
    text: 'text-danger',
    dot: 'bg-danger',
  },
  untested: {
    label: '未练习',
    en: 'Untested',
    color: 'rgb(var(--line-strong))',
    soft: 'bg-sunken',
    text: 'text-ink-3',
    dot: 'bg-line-strong',
  },
};

export const UNIT_META: Record<number, { title: string; subtitle: string; tone: 'accent' | 'sky' | 'plum' | 'ink' }> = {
  1: { title: 'College Life & Ambition', subtitle: '大学生活与志向', tone: 'accent' },
  2: { title: 'Technology & Sustainability', subtitle: '科技与可持续发展', tone: 'sky' },
  3: { title: 'Scientific Inquiry', subtitle: '科学探究', tone: 'ink' },
  4: { title: 'Global Perspectives', subtitle: '全球视野', tone: 'ink' },
};

export function getUnitMeta(unit: number) {
  return UNIT_META[unit] ?? { title: `Unit ${unit}`, subtitle: '自定义单元', tone: 'ink' as const };
}

/** Units present in the bank, sorted. Falls back to 1–4 for an empty bank. */
export function getAvailableUnits(questions: VocabularyQuestion[]) {
  const set = new Set(questions.map((q) => q.unit));
  const list = Array.from(set).sort((a, b) => a - b);
  return list.length ? list : [1, 2, 3, 4];
}

/** Split a cloze sentence around its blank. */
export function splitSentence(sentence: string) {
  const parts = sentence.split('_____');
  return { before: parts[0] ?? '', after: parts.slice(1).join('_____') };
}

/** Longest common prefix length (case-insensitive) — used to highlight the differing suffix. */
export function commonPrefixLength(a: string, b: string) {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
}

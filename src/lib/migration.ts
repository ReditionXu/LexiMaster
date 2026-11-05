import type {
  ExamSessionResult,
  SeedQuestion,
  Unit,
  UserAnswerRecord,
  VocabularyQuestion,
} from '../types';

/**
 * Data migration v1/v2 → v3 (dynamic units).
 *
 * v1/v2 stored questions with a numeric `unit` (1–4). v3 introduces Unit entities
 * with stable UUIDs; every question, answer-history snapshot and exam result is
 * linked by `unitId`. The migration is:
 *   - pure (no storage access) so it can be unit-tested,
 *   - idempotent (running it twice changes nothing),
 *   - lossless (no question, history record, mistake or exam is dropped).
 */

export const SCHEMA_VERSION = 3;

/** English subtitles for the original textbook units (kept as unit descriptions). */
export const LEGACY_UNIT_DESCRIPTIONS: Record<number, string> = {
  1: 'College Life & Ambition',
  2: 'Technology & Sustainability',
  3: 'Scientific Inquiry',
  4: 'Global Perspectives',
};

export function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 fallback for non-secure contexts (e.g. http:// on a LAN IP)
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface Snapshot {
  questions: (VocabularyQuestion | SeedQuestion)[];
  units?: Unit[] | null;
  history?: UserAnswerRecord[] | null;
  exams?: ExamSessionResult[] | null;
}

export interface MigratedSnapshot {
  questions: VocabularyQuestion[];
  units: Unit[];
  history: UserAnswerRecord[];
  exams: ExamSessionResult[];
  changed: boolean;
  report: { createdUnits: number; questionsLinked: number; historyLinked: number; examsLinked: number };
}

function legacyNumberOf(q: { unit?: unknown } | undefined): number {
  const n = Number(q?.unit);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Find or create the unit that represents a legacy numeric unit. */
export function ensureLegacyUnit(units: Unit[], n: number, now = Date.now(), gen = uuid): { unit: Unit; created: boolean } {
  const found = units.find((u) => u.legacyNumber === n);
  if (found) return { unit: found, created: false };
  const unit: Unit = {
    id: gen(),
    name: `Unit ${n}`,
    description: LEGACY_UNIT_DESCRIPTIONS[n],
    order: units.length ? Math.max(...units.map((u) => u.order)) + 1 : 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    legacyNumber: n,
  };
  units.push(unit);
  return { unit, created: true };
}

export function migrateSnapshot(input: Snapshot, gen: () => string = uuid, now = Date.now()): MigratedSnapshot {
  const units: Unit[] = (input.units ?? []).map((u) => ({ ...u }));
  const unitIds = new Set(units.map((u) => u.id));
  const report = { createdUnits: 0, questionsLinked: 0, historyLinked: 0, examsLinked: 0 };

  // Create units for legacy numbers in ascending order so Unit 1 comes first.
  const legacyNumbers = Array.from(
    new Set(
      input.questions
        .filter((q) => !q.unitId || !unitIds.has(q.unitId))
        .map((q) => legacyNumberOf(q))
    )
  ).sort((a, b) => a - b);
  for (const n of legacyNumbers) {
    const r = ensureLegacyUnit(units, n, now, gen);
    if (r.created) {
      report.createdUnits++;
      unitIds.add(r.unit.id);
    }
  }

  const resolve = (q: { unitId?: string; unit?: unknown } | undefined): string => {
    if (q?.unitId && unitIds.has(q.unitId)) return q.unitId;
    const r = ensureLegacyUnit(units, legacyNumberOf(q), now, gen);
    if (r.created) {
      report.createdUnits++;
      unitIds.add(r.unit.id);
    }
    return r.unit.id;
  };

  const questions: VocabularyQuestion[] = input.questions.map((q) => {
    if (q.unitId && unitIds.has(q.unitId)) return q as VocabularyQuestion;
    report.questionsLinked++;
    return { ...(q as VocabularyQuestion), unitId: resolve(q) };
  });
  const bankUnitById = new Map(questions.map((q) => [q.id, q.unitId]));

  const linkRecord = (r: UserAnswerRecord): UserAnswerRecord => {
    const q = r.question as VocabularyQuestion | undefined;
    if (!q) return r;
    if (q.unitId && unitIds.has(q.unitId)) return r;
    report.historyLinked++;
    const unitId = bankUnitById.get(r.questionId) ?? bankUnitById.get(q.id) ?? resolve(q);
    return { ...r, question: { ...q, unitId } };
  };

  const history = (input.history ?? []).map(linkRecord);

  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? '已删除单元';
  const exams = (input.exams ?? []).map((e) => {
    const answers = (e.answers ?? []).map(linkRecord);
    if (e.unitIds && e.unitNames) return answers === e.answers ? e : { ...e, answers };
    report.examsLinked++;
    let ids = Array.from(new Set(answers.map((a) => a.question?.unitId).filter(Boolean) as string[]));
    if (ids.length === 0 && typeof e.unit === 'number') ids = [ensureLegacyUnit(units, e.unit, now, gen).unit.id];
    return { ...e, answers, unitIds: ids, unitNames: ids.map(nameOf) };
  });

  const changed =
    report.createdUnits + report.questionsLinked + report.historyLinked + report.examsLinked > 0 ||
    (input.units ?? []).length !== units.length;

  return { questions, units, history, exams, changed, report };
}

/** Attach unitIds to seed/default questions, creating legacy units as needed. */
export function seedToQuestions(seed: SeedQuestion[], units: Unit[], gen = uuid, now = Date.now()) {
  const list = units.map((u) => ({ ...u }));
  const questions = seed.map((q) => {
    const { unit } = ensureLegacyUnit(list, q.unit, now, gen);
    return { ...q, unitId: unit.id } as VocabularyQuestion;
  });
  return { questions, units: list };
}

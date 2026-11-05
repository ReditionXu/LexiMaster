import type { Unit, VocabularyQuestion } from '../types';
import { uuid } from './migration';

/** Unit helpers. Everything is keyed by Unit.id — never by position or name. */

export type UnitTone = 'accent' | 'sky' | 'plum' | 'ink';
const TONES: UnitTone[] = ['accent', 'sky', 'plum', 'ink'];

export const sortUnits = (units: Unit[]) => [...units].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

/** Units available for practice, exams, AI and stats. */
export const activeUnits = (units: Unit[]) => sortUnits(units.filter((u) => !u.archived && !u.deletedAt));
export const archivedUnits = (units: Unit[]) => sortUnits(units.filter((u) => u.archived && !u.deletedAt));
export const trashedUnits = (units: Unit[]) => [...units.filter((u) => u.deletedAt)].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

export function unitTone(units: Unit[], id: string): UnitTone {
  const idx = activeUnits(units).findIndex((u) => u.id === id);
  return TONES[(idx < 0 ? 3 : idx) % TONES.length];
}

export function unitLabel(units: Unit[], id: string | undefined, fallback = '已删除单元'): string {
  if (!id) return fallback;
  return units.find((u) => u.id === id)?.name ?? fallback;
}

/** Short tag for compact places (e.g. "U1" for "Unit 1", else first 6 chars). */
export function unitShort(units: Unit[], id: string): string {
  const name = unitLabel(units, id, '—');
  const m = name.match(/^unit\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  return name.length > 8 ? name.slice(0, 7) + '…' : name;
}

/** Questions whose unit is active (not archived / not in trash). */
export function practiceQuestions(questions: VocabularyQuestion[], units: Unit[]) {
  const ok = new Set(activeUnits(units).map((u) => u.id));
  return questions.filter((q) => ok.has(q.unitId));
}

export function countByUnit(questions: VocabularyQuestion[]) {
  const m = new Map<string, number>();
  for (const q of questions) m.set(q.unitId, (m.get(q.unitId) ?? 0) + 1);
  return m;
}

export const MAX_UNIT_NAME = 40;

export function validateUnitName(name: string, units: Unit[], selfId?: string): string | null {
  const n = name.trim();
  if (!n) return '请输入单元名称';
  if (n.length > MAX_UNIT_NAME) return `名称不能超过 ${MAX_UNIT_NAME} 个字符`;
  const dup = units.find((u) => !u.deletedAt && u.id !== selfId && u.name.trim().toLowerCase() === n.toLowerCase());
  if (dup) return '已有同名单元';
  return null;
}

export function makeUnit(name: string, units: Unit[], description?: string): Unit {
  const now = Date.now();
  return {
    id: uuid(),
    name: name.trim(),
    description: description?.trim() || undefined,
    order: units.length ? Math.max(...units.map((u) => u.order)) + 1 : 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a unit up/down among active units; returns a renumbered list. */
export function moveUnit(units: Unit[], id: string, dir: -1 | 1): Unit[] {
  const list = activeUnits(units);
  const i = list.findIndex((u) => u.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return units;
  [list[i], list[j]] = [list[j], list[i]];
  const order = new Map(list.map((u, k) => [u.id, k]));
  const now = Date.now();
  return units.map((u) => (order.has(u.id) ? { ...u, order: order.get(u.id)!, updatedAt: order.get(u.id) !== u.order ? now : u.updatedAt } : u));
}

/** Resolve a free-form unit reference from an import row (number, "Unit 3", or a name). */
export function resolveUnitRef(ref: unknown, units: Unit[]): Unit | undefined {
  if (ref === undefined || ref === null || String(ref).trim() === '') return undefined;
  const live = units.filter((u) => !u.deletedAt);
  const s = String(ref).trim();
  const byId = live.find((u) => u.id === s);
  if (byId) return byId;
  const byName = live.find((u) => u.name.trim().toLowerCase() === s.toLowerCase());
  if (byName) return byName;
  const n = Number(s.replace(/^unit\s*/i, ''));
  if (Number.isInteger(n) && n > 0) {
    return live.find((u) => u.legacyNumber === n) ?? live.find((u) => u.name.trim().toLowerCase() === `unit ${n}`);
  }
  return undefined;
}

/** Presentation for unit cards: "Unit 3" → numeral 03 + description as title; custom names keep their name. */
export function unitDisplay(unit: Unit, index: number) {
  const m = unit.name.match(/^unit\s*(\d+)$/i);
  if (m) {
    return {
      numeral: m[1].padStart(2, '0'),
      eyebrow: 'Unit',
      title: unit.description || unit.name,
      subtitle: unit.description ? unit.name : '',
    };
  }
  return { numeral: String(index + 1).padStart(2, '0'), eyebrow: 'Set', title: unit.name, subtitle: unit.description || '' };
}

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { Unit } from '../../types';
import { activeUnits, archivedUnits, makeUnit, moveUnit, trashedUnits, validateUnitName, MAX_UNIT_NAME } from '../../lib/units';
import { Button } from '../ui/Button';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { spring } from '../../lib/motion';

interface UnitsPanelProps {
  units: Unit[];
  counts: Map<string, number>;
  totalCount: number;
  selected: string | 'all';
  onSelect: (id: string | 'all') => void;
  onChangeUnits: (units: Unit[]) => void;
  /** Permanently remove a unit and its words (history snapshots are kept). */
  onPurgeUnit: (unitId: string) => void;
}

export const UnitsPanel: React.FC<UnitsPanelProps> = ({
  units,
  counts,
  totalCount,
  selected,
  onSelect,
  onChangeUnits,
  onPurgeUnit,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<Unit | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Unit | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const active = activeUnits(units);
  const archived = archivedUnits(units);
  const trashed = trashedUnits(units);

  const patch = (id: string, p: Partial<Unit>) =>
    onChangeUnits(units.map((u) => (u.id === id ? { ...u, ...p, updatedAt: Date.now() } : u)));

  const create = () => {
    const err = validateUnitName(newName, units);
    if (err) return setCreateError(err);
    const u = makeUnit(newName, units, newDesc);
    onChangeUnits([...units, u]);
    setNewName('');
    setNewDesc('');
    setCreating(false);
    setCreateError(null);
    onSelect(u.id);
  };

  const saveEdit = () => {
    if (!editing) return;
    const err = validateUnitName(editName, units, editing.id);
    if (err) return setEditError(err);
    patch(editing.id, { name: editName.trim(), description: editDesc.trim() || undefined });
    setEditing(null);
  };

  const row = (u: Unit, kind: 'active' | 'archived' | 'trash', index = 0) => {
    const isSel = selected === u.id;
    const count = counts.get(u.id) ?? 0;
    return (
      <motion.li
        key={u.id}
        layout
        transition={spring.gentle}
        className={`group relative flex items-center gap-1 rounded-md ${isSel ? 'bg-surface shadow-sm ring-1 ring-line dark:bg-elevated' : 'hover:bg-sunken/70'}`}
      >
        <button
          onClick={() => kind !== 'trash' && onSelect(u.id)}
          className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left ${kind === 'trash' ? 'cursor-default' : ''}`}
          aria-current={isSel ? 'true' : undefined}
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[13.5px] font-medium ${kind === 'active' ? 'text-ink' : 'text-ink-2'}`}>{u.name}</span>
            {u.description && <span className="block truncate text-[11.5px] text-ink-3">{u.description}</span>}
          </span>
          <span className="num shrink-0 text-[12px] text-ink-3">{count}</span>
        </button>

        {kind === 'active' && (
          <div className="relative">
            <button
              onClick={() => setMenuFor(menuFor === u.id ? null : u.id)}
              className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 opacity-100 transition-opacity hover:bg-sunken hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
              aria-label={`${u.name} 的操作`}
              aria-haspopup="menu"
              aria-expanded={menuFor === u.id}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {menuFor === u.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, scale: 0.97, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={spring.snappy}
                    style={{ originX: 1, originY: 0 }}
                    className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-line bg-elevated p-1 shadow-lg"
                  >
                    <MenuItem
                      icon={<Pencil />}
                      label="重命名"
                      onClick={() => {
                        setMenuFor(null);
                        setEditing(u);
                        setEditName(u.name);
                        setEditDesc(u.description ?? '');
                        setEditError(null);
                      }}
                    />
                    <MenuItem icon={<ArrowUp />} label="上移" disabled={index === 0} onClick={() => onChangeUnits(moveUnit(units, u.id, -1))} />
                    <MenuItem
                      icon={<ArrowDown />}
                      label="下移"
                      disabled={index === active.length - 1}
                      onClick={() => onChangeUnits(moveUnit(units, u.id, 1))}
                    />
                    <div className="my-1 h-px bg-line" />
                    <MenuItem
                      icon={<Archive />}
                      label="归档"
                      onClick={() => {
                        setMenuFor(null);
                        patch(u.id, { archived: true });
                        if (selected === u.id) onSelect('all');
                      }}
                    />
                    <MenuItem
                      icon={<Trash2 />}
                      label="删除…"
                      danger
                      onClick={() => {
                        setMenuFor(null);
                        setTrashTarget(u);
                      }}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
        {kind === 'archived' && (
          <Button size="icon-sm" variant="ghost" className="mr-1" aria-label={`恢复 ${u.name}`} title="恢复" onClick={() => patch(u.id, { archived: false })}>
            <ArchiveRestore className="h-3.5 w-3.5" />
          </Button>
        )}
        {kind === 'trash' && (
          <div className="mr-1 flex">
            <Button size="icon-sm" variant="ghost" aria-label={`从回收站恢复 ${u.name}`} title="恢复" onClick={() => patch(u.id, { deletedAt: undefined })}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="hover:!text-danger"
              aria-label={`永久删除 ${u.name}`}
              title="永久删除"
              onClick={() => {
                setPurgeTarget(u);
                setPurgeConfirm('');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </motion.li>
    );
  };

  return (
    <aside className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Layers className="h-4 w-4 text-ink-2" />
          单元
          <span className="num text-[12px] font-normal text-ink-3">{active.length}</span>
        </h2>
        <Button size="sm" variant="ghost" leading={<Plus />} onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
          新建
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
              <input
                autoFocus
                value={newName}
                maxLength={MAX_UNIT_NAME}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="单元名称，如 Unit 5、CET-4 Vocabulary"
                className="field !py-2"
                aria-label="新单元名称"
              />
              <input value={newDesc} maxLength={80} onChange={(e) => setNewDesc(e.target.value)} placeholder="副标题（可选）" className="field !py-2" aria-label="新单元副标题" />
              {createError && <p className="text-[12.5px] text-danger" role="alert">{createError}</p>}
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  取消
                </Button>
                <Button size="sm" variant="primary" type="submit" leading={<Check />}>
                  创建
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => onSelect('all')}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] font-medium ${
              selected === 'all' ? 'bg-surface text-ink shadow-sm ring-1 ring-line dark:bg-elevated' : 'text-ink-2 hover:bg-sunken/70'
            }`}
          >
            全部词汇
            <span className="num text-[12px] font-normal text-ink-3">{totalCount}</span>
          </button>
        </li>
        {active.map((u, i) => row(u, 'active', i))}
      </ul>
      {active.length === 0 && <p className="px-3 text-[12.5px] text-ink-3">还没有单元。点击「新建」开始。</p>}

      {archived.length > 0 && (
        <Section title="已归档" count={archived.length} open={showArchived} onToggle={() => setShowArchived((o) => !o)} hint="归档的单元不参与练习、考试与统计，可随时恢复。">
          {archived.map((u) => row(u, 'archived'))}
        </Section>
      )}
      {trashed.length > 0 && (
        <Section title="回收站" count={trashed.length} open={showTrash} onToggle={() => setShowTrash((o) => !o)} hint="回收站中的单元可恢复；永久删除后无法找回。">
          {trashed.map((u) => row(u, 'trash'))}
        </Section>
      )}

      {/* Rename */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑单元" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">名称</span>
            <input value={editName} maxLength={MAX_UNIT_NAME} onChange={(e) => { setEditName(e.target.value); setEditError(null); }} className="field" data-autofocus />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">副标题</span>
            <input value={editDesc} maxLength={80} onChange={(e) => setEditDesc(e.target.value)} className="field" placeholder="可选" />
          </label>
          {editError && <p className="text-[12.5px] text-danger" role="alert">{editError}</p>}
          <p className="text-[12px] text-ink-3">改名不会影响该单元的词汇、学习记录或历史成绩。</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
            <Button variant="primary" type="submit">保存</Button>
          </div>
        </form>
      </Modal>

      {/* Move to trash */}
      <ConfirmDialog
        open={!!trashTarget}
        title={trashTarget ? `删除「${trashTarget.name}」？` : ''}
        confirmLabel="移到回收站"
        tone="danger"
        onCancel={() => setTrashTarget(null)}
        onConfirm={() => {
          if (trashTarget) {
            patch(trashTarget.id, { deletedAt: Date.now() });
            if (selected === trashTarget.id) onSelect('all');
          }
          setTrashTarget(null);
        }}
      >
        {trashTarget && (
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-ink-2">
            <li>· 此单元包含 <strong className="num text-ink">{counts.get(trashTarget.id) ?? 0}</strong> 个词汇。</li>
            <li>· 移到回收站后，这些词汇不再出现在练习、模拟考试、AI 出题和统计中。</li>
            <li>· 历史成绩、答题记录和错题记录会保留。</li>
            <li>· <strong className="text-ink">可以恢复</strong>：在「回收站」中一键还原；只有永久删除才无法找回。</li>
          </ul>
        )}
      </ConfirmDialog>

      {/* Permanent delete — second confirmation, must type the name */}
      <Modal
        open={!!purgeTarget}
        onClose={() => setPurgeTarget(null)}
        title={purgeTarget ? `永久删除「${purgeTarget.name}」` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurgeTarget(null)}>取消</Button>
            <Button
              variant="danger"
              disabled={!purgeTarget || purgeConfirm.trim() !== purgeTarget.name.trim()}
              onClick={() => {
                if (purgeTarget) onPurgeUnit(purgeTarget.id);
                setPurgeTarget(null);
              }}
            >
              永久删除
            </Button>
          </>
        }
      >
        {purgeTarget && (
          <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-2">
            <p>
              将永久删除该单元及其 <strong className="num text-ink">{counts.get(purgeTarget.id) ?? 0}</strong> 个词汇，<strong className="text-danger">此操作无法撤销</strong>。
            </p>
            <p>已完成的考试成绩与答题历史保留快照（显示原单元名称），不会丢失。</p>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px]">请输入单元名称 <strong className="text-ink">{purgeTarget.name}</strong> 以确认：</span>
              <input value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} className="field" data-autofocus aria-label="输入单元名称确认" />
            </label>
          </div>
        )}
      </Modal>
    </aside>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }> = ({
  icon,
  label,
  onClick,
  disabled,
  danger,
}) => (
  <button
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${
      danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-sunken'
    }`}
  >
    <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
    {label}
  </button>
);

const Section: React.FC<{ title: string; count: number; open: boolean; onToggle: () => void; hint: string; children: React.ReactNode }> = ({
  title,
  count,
  open,
  onToggle,
  hint,
  children,
}) => (
  <div className="border-t border-line pt-3">
    <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">
      <span>
        {title} <span className="num text-ink-3">{count}</span>
      </span>
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <p className="px-1 pt-1.5 text-[11.5px] text-ink-3">{hint}</p>
          <ul className="mt-2 space-y-0.5">{children}</ul>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

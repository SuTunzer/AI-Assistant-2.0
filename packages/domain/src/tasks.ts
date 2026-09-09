import type { ChecklistItem, Task } from './types.js';
export const META_DELIMITER = '===== AI TASK ASSISTANT \u2014 DO NOT EDIT BELOW =====';
export const DESCRIPTION_DELIMITER = '===== DESCRIPTION =====';
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function parseTaskNotes(raw: string) {
  const at = raw.indexOf(META_DELIMITER);
  const head = at < 0 ? raw : raw.slice(0, at);
  let meta: Record<string, unknown> = {};
  let valid = true;
  if (at >= 0) {
    try {
      const v = JSON.parse(raw.slice(at + META_DELIMITER.length));
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error();
      meta = v;
    } catch {
      valid = false;
    }
  }
  const subtasks = Array.isArray(meta.subtasks)
    ? meta.subtasks.filter(
        (s): s is ChecklistItem =>
          !!s &&
          typeof s === 'object' &&
          typeof s.id === 'string' &&
          typeof s.title === 'string' &&
          typeof s.done === 'boolean',
      )
    : [];
  if (
    meta.subtasks !== undefined &&
    (!Array.isArray(meta.subtasks) || subtasks.length !== meta.subtasks.length)
  )
    valid = false;
  return { head, meta, valid, subtasks, hasMeta: at >= 0 };
}
export function editChecklist(
  raw: string,
  itemId: string,
  change: { done?: boolean; title?: string; remove?: boolean; move?: 'up' | 'down' },
  add?: ChecklistItem,
) {
  const parsed = parseTaskNotes(raw);
  if (!parsed.valid)
    throw new DomainError(
      'TASK_METADATA_INVALID',
      'This task has malformed legacy metadata. Repair it in the original app before changing its checklist.',
      409,
    );
  const items = parsed.subtasks.map((i) => ({ ...i }));
  const index = items.findIndex((i) => i.id === itemId);
  if (add) {
    if (items.some((i) => i.id === add.id)) return raw;
    items.push(add);
  } else {
    if (index < 0)
      throw new DomainError('TASK_CONFLICT', 'This checklist item changed. Refresh the task.', 409);
    if (change.remove) items.splice(index, 1);
    else if (change.move) {
      // Steps display in stored order, so reordering is a swap with the
      // neighbour. A move off either end is a no-op rather than an error, so a
      // fast double-tap on the top item does not fail.
      const target = change.move === 'up' ? index - 1 : index + 1;
      if (target >= 0 && target < items.length)
        [items[index], items[target]] = [items[target], items[index]];
    } else {
      if (change.done !== undefined) items[index].done = change.done;
      if (change.title !== undefined) items[index].title = change.title;
    }
  }
  const head = parsed.hasMeta ? parsed.head : raw ? raw + '\n\n' : '';
  const next = head + META_DELIMITER + '\n' + JSON.stringify({ ...parsed.meta, subtasks: items });
  if (next.length > 8192)
    throw new DomainError(
      'TASK_NOTES_FULL',
      'There is not enough room in this task’s notes. Your existing history was preserved.',
      409,
    );
  return next;
}
export function fromGoogleTask(listId: string, g: Record<string, any>): Task {
  const p = parseTaskNotes(g.notes || '');
  return {
    id: g.id,
    listId,
    title: g.title || '',
    status: g.status === 'completed' ? 'completed' : 'needsAction',
    due: g.due?.slice(0, 10),
    position: g.position || '',
    parent: g.parent,
    notes: p.head.replace(DESCRIPTION_DELIMITER, '').trim(),
    subtasks: p.subtasks,
    etag: g.etag,
    updated: g.updated,
    tags: Array.isArray(p.meta.tags)
      ? p.meta.tags.filter((x): x is string => typeof x === 'string')
      : [],
    metadataValid: p.valid,
  };
}
/**
 * The tasks a briefing may speak about: the top of the user’s own priority
 * order, plus the native children of those tasks. The list order is the
 * priority order, so this is a cut from the top rather than a ranking. Scaled
 * gently by length — a longer briefing earns a couple more, never the whole
 * backlog, because the point is what to do next.
 */
export function topPriorityTasks(tasks: Task[], minutes: number): Task[] {
  const open = tasks.filter((t) => t.status === 'needsAction');
  const focus = open
    .filter((t) => !t.parent)
    .slice(0, Math.max(3, Math.min(8, Math.ceil(minutes / 2))));
  const ids = new Set(focus.map((t) => t.id));
  return open.filter((t) => ids.has(t.id) || (t.parent ? ids.has(t.parent) : false));
}
export function orderTasks(tasks: Task[]): Task[] {
  const output: Task[] = [];
  const visited = new Set<string>();
  const walk = (parent?: string) => {
    for (const t of tasks
      .filter((t) => t.parent === parent)
      .sort((a, b) => a.position.localeCompare(b.position))) {
      if (visited.has(t.id)) continue;
      visited.add(t.id);
      output.push(t);
      walk(t.id);
    }
  };
  walk();
  for (const task of tasks) if (!visited.has(task.id)) output.push(task);
  return output;
}

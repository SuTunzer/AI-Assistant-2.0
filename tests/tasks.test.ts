import { describe, it, expect } from 'vitest';
import {
  parseTaskNotes,
  editChecklist,
  fromGoogleTask,
  orderTasks,
  topPriorityTasks,
  META_DELIMITER,
} from '../packages/domain/src/tasks';
import type { Task } from '../packages/domain/src/types';
const item = {
  id: 'step-1',
  title: 'First action',
  done: false,
  createdBy: 'user' as const,
  createdAt: '2026-09-01',
  futureField: { keep: true },
};
describe('compatibility with the existing task assistant', () => {
  it('preserves exact user notes, unknown metadata, checklist IDs, and legacy history', () => {
    const head = '  My notes\r\n===== DESCRIPTION =====\r\nkeep this\n\n';
    const meta = {
      subtasks: [item],
      interactionLog: [{ text: 'old history' }],
      customFutureValue: { nested: [1, 2] },
    };
    const raw = head + META_DELIMITER + '\n' + JSON.stringify(meta);
    const edited = editChecklist(raw, item.id, { done: true });
    const parsed = parseTaskNotes(edited);
    expect(parsed.head).toBe(head);
    expect(parsed.meta).toEqual({ ...meta, subtasks: [{ ...item, done: true }] });
    expect(fromGoogleTask('list', { id: 'task', notes: edited }).notes).not.toContain(
      'old history',
    );
  });
  it('refuses malformed metadata instead of discarding it', () => {
    expect(() =>
      editChecklist('notes' + META_DELIMITER + '{broken', item.id, { done: true }),
    ).toThrow();
    expect(() =>
      editChecklist(
        META_DELIMITER + JSON.stringify({ subtasks: [item, { incomplete: true }] }),
        item.id,
        { done: true },
      ),
    ).toThrow();
  });
  it('does not truncate history when a task reaches the Google notes limit', () => {
    const raw = 'x'.repeat(8200) + META_DELIMITER + JSON.stringify({ subtasks: [item] });
    expect(() => editChecklist(raw, item.id, { done: true })).toThrow(/preserved/);
  });
  it('keeps native parents distinct from embedded checklist items', () => {
    const child = fromGoogleTask('list', {
      id: 'child',
      parent: 'parent',
      position: '1',
      notes: 'hello',
    });
    const parent = fromGoogleTask('list', {
      id: 'parent',
      position: '0',
      notes: META_DELIMITER + JSON.stringify({ subtasks: [item] }),
    });
    expect(orderTasks([child, parent]).map((t) => t.id)).toEqual(['parent', 'child']);
    expect(child.subtasks).toEqual([]);
    expect(parent.subtasks[0].id).toBe(item.id);
  });
  it('is idempotent when a checklist addition is retried', () => {
    const once = editChecklist('My notes', item.id, {}, item);
    expect(editChecklist(once, item.id, {}, item)).toBe(once);
  });
  it('reorders checklist steps and treats a move off the end as a no-op', () => {
    const raw =
      META_DELIMITER +
      '\n' +
      JSON.stringify({
        subtasks: [
          { ...item, id: 'a' },
          { ...item, id: 'b' },
          { ...item, id: 'c' },
        ],
      });
    expect(
      parseTaskNotes(editChecklist(raw, 'a', { move: 'down' })).subtasks.map((s) => s.id),
    ).toEqual(['b', 'a', 'c']);
    expect(
      parseTaskNotes(editChecklist(raw, 'a', { move: 'up' })).subtasks.map((s) => s.id),
    ).toEqual(['a', 'b', 'c']);
  });
  it('gives a briefing the top of the priority order, not the backlog', () => {
    const task = (id: string, extra: Partial<Task> = {}): Task => ({
      id,
      listId: 'personal',
      title: id,
      status: 'needsAction',
      position: id,
      notes: '',
      subtasks: [],
      tags: [],
      metadataValid: true,
      ...extra,
    });
    const list = [
      task('a'),
      task('a-child', { parent: 'a' }),
      task('b'),
      task('c'),
      task('d'),
      task('e'),
      task('done', { status: 'completed' }),
    ];
    // A short briefing takes the first three top-level tasks, in list order,
    // and carries their children with them.
    expect(topPriorityTasks(list, 6).map((t) => t.id)).toEqual(['a', 'a-child', 'b', 'c']);
    // Length earns a couple more, and never the completed ones.
    expect(topPriorityTasks(list, 16).map((t) => t.id)).toEqual([
      'a',
      'a-child',
      'b',
      'c',
      'd',
      'e',
    ]);
    // Three is the floor however short the briefing is.
    expect(topPriorityTasks(list, 1).filter((t) => !t.parent)).toHaveLength(3);
  });
});

import { afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../apps/api/src/store';
import { reserveCost, settleCost } from '../apps/api/src/budget';
import { DEFAULT_SETTINGS } from '../packages/domain/src/types';
import { monthKey, episodeEstimate, textCost } from '../packages/domain/src/budget';
const path = await mkdtemp(join(tmpdir(), 'steadier-test-budget-'));
const db = new FileStore(path);
afterAll(() => rm(path, { recursive: true, force: true }));
describe('budget authorization', () => {
  it('does not let concurrent reservations overspend the monthly allowance', async () => {
    const settings = { ...DEFAULT_SETTINGS, monthlyBudgetAud: 10 };
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reserveCost('job-' + i, 2, settings, db)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const row = await db.get('budget', monthKey(settings.timezone));
    expect(Object.values(row!.reservations).reduce((a: any, b: any) => a + b, 0)).toBe(8);
  });
  it('reserves and settles a job exactly once, including unknown outcomes', async () => {
    const month = await reserveCost('one', 0.2, DEFAULT_SETTINGS, db);
    await reserveCost('one', 0.2, DEFAULT_SETTINGS, db);
    await settleCost('one', month, undefined, db);
    await settleCost('one', month, 4, db);
    await reserveCost('one', 2, DEFAULT_SETTINGS, db);
    const row = (await db.get('budget', month))!;
    expect(row.settled.one).toBe(0.2);
    expect(row.reservations.one).toBeUndefined();
  });
  it('uses the owner timezone at a month boundary', () => {
    expect(monthKey('Australia/Melbourne', new Date('2026-08-31T14:30:00Z'))).toBe('2026-09');
    expect(monthKey('Europe/London', new Date('2026-08-31T14:30:00Z'))).toBe('2026-08');
  });
  it('rejects unpriced models and estimates longer audio at higher cost', () => {
    expect(() => textCost('unpriced', 100, 100)).toThrow();
    expect(episodeEstimate(DEFAULT_SETTINGS, 10)).toBeGreaterThan(
      episodeEstimate(DEFAULT_SETTINGS, 2),
    );
  });
});

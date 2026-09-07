import { monthKey } from '../../../packages/domain/src/budget.js';
import { DomainError } from '../../../packages/domain/src/tasks.js';
import type { Budget, Settings } from '../../../packages/domain/src/types.js';
import { store, type Store } from './store.js';
interface Ledger {
  id: string;
  spent: number;
  reservations: Record<string, number>;
  settled: Record<string, number>;
}
export async function reserveCost(id: string, amount: number, s: Settings, db: Store = store) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid cost');
  const month = monthKey(s.timezone);
  await db.atomic<Ledger, void>('budget', month, (current) => {
    const row: Ledger = current || { id: month, spent: 0, reservations: {}, settled: {} };
    if (id in row.settled || id in row.reservations) return { value: row, result: undefined };
    const available =
      s.monthlyBudgetAud -
      Math.min(2, s.monthlyBudgetAud * 0.1) -
      row.spent -
      Object.values(row.reservations).reduce((a, b) => a + b, 0);
    if (amount > available)
      throw new DomainError(
        'BUDGET_LIMIT',
        'This would exceed your monthly allowance. Try a shorter episode or increase the budget in Settings.',
        409,
      );
    row.reservations[id] = amount;
    return { value: row, result: undefined };
  });
  return month;
}
export async function settleCost(id: string, month: string, actual?: number, db: Store = store) {
  await db.atomic<Ledger, void>('budget', month, (row) => {
    if (!row || id in row.settled) return { value: row || null, result: undefined };
    const reserved = row.reservations[id] || 0;
    const charged = actual === undefined ? reserved : Math.max(0, actual);
    row.spent += charged;
    row.settled[id] = charged;
    delete row.reservations[id];
    return { value: row, result: undefined };
  });
}
export async function budgetStatus(s: Settings): Promise<Budget> {
  const month = monthKey(s.timezone),
    row = await store.get<Ledger>('budget', month);
  const spentAud = row?.spent || 0,
    reservedAud = Object.values(row?.reservations || {}).reduce((a, b) => a + b, 0);
  return {
    month,
    spentAud,
    reservedAud,
    limitAud: s.monthlyBudgetAud,
    remainingAud: Math.max(
      0,
      s.monthlyBudgetAud - Math.min(2, s.monthlyBudgetAud * 0.1) - spentAud - reservedAud,
    ),
  };
}

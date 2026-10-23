import type { RiskItem, RiskLevel } from './types';

const CRITICAL_ITEMS: RiskItem[] = ['threatsToKill', 'strangulation', 'weaponAccess'];

/**
 * Simplified screening rule for the prototype. Any critical item, or three or more items,
 * flags HIGH risk and triggers an immediate-protection prompt.
 */
export function assessRisk(answers: Partial<Record<RiskItem, boolean>>): RiskLevel {
  const yes = (Object.keys(answers) as RiskItem[]).filter((k) => answers[k] === true);
  if (yes.some((k) => CRITICAL_ITEMS.includes(k)) || yes.length >= 3) return 'HIGH';
  if (yes.length >= 1) return 'MEDIUM';
  return 'LOW';
}

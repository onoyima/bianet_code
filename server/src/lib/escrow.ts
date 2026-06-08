/**
 * Escrow State Machine
 *
 * Valid transitions:
 * AWAITING_DEPOSIT → FUNDS_HELD         (payment webhook confirms deposit)
 * FUNDS_HELD       → FUNDS_RELEASED     (buyer confirms delivery)
 * FUNDS_HELD       → IN_DISPUTE         (buyer or seller raises dispute)
 * FUNDS_HELD       → REFUNDED           (admin or system refund)
 * IN_DISPUTE       → ARBITRATION_SETTLED (admin resolves)
 * IN_DISPUTE       → FUNDS_RELEASED     (admin rules for seller)
 * IN_DISPUTE       → REFUNDED           (admin rules for buyer)
 * ARBITRATION_SETTLED → (terminal)
 * FUNDS_RELEASED  → (terminal)
 * REFUNDED        → (terminal)
 * CANCELLED       → (terminal)
 */

export type EscrowStatus =
  | "AWAITING_DEPOSIT"
  | "FUNDS_HELD"
  | "FUNDS_RELEASED"
  | "IN_DISPUTE"
  | "ARBITRATION_SETTLED"
  | "REFUNDED"
  | "CANCELLED";

const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  AWAITING_DEPOSIT: ["FUNDS_HELD", "CANCELLED"],
  FUNDS_HELD: ["FUNDS_RELEASED", "IN_DISPUTE", "REFUNDED"],
  FUNDS_RELEASED: [],
  IN_DISPUTE: ["ARBITRATION_SETTLED", "FUNDS_RELEASED", "REFUNDED"],
  ARBITRATION_SETTLED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export class EscrowTransitionError extends Error {
  constructor(from: EscrowStatus, to: EscrowStatus) {
    super(`Invalid escrow transition: ${from} → ${to}`);
    this.name = "EscrowTransitionError";
  }
}

export function validateEscrowTransition(
  current: EscrowStatus,
  next: EscrowStatus,
): void {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new EscrowTransitionError(current, next);
  }
}

export function isTerminalStatus(status: EscrowStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

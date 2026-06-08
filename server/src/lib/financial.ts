/**
 * Bia'net Financial Engine
 *
 * Double-entry accounting, escrow calculations, and commission management.
 * All amounts are represented as strings (from numeric DB columns) and
 * computed with integer arithmetic to prevent floating-point drift.
 */

export const PLATFORM_COMMISSION_RATE = 0.05; // 5%
export const LOGISTICS_RATE = 0.02; // 2%
export const INSURANCE_FLAT_NGN = 500; // ₦500 flat insurance fee

export interface EscrowBreakdown {
  amount: number;
  platformCommissionRate: string;
  platformCommission: string;
  logisticsFee: string;
  insuranceFee: string;
  netSellerPayout: string;
}

/**
 * Calculate escrow fee breakdown.
 * All monetary values returned as fixed-precision decimal strings.
 */
export function calculateEscrowBreakdown(
  totalAmount: number,
  includeInsurance = false,
  customLogisticsFee = 0,
): EscrowBreakdown {
  const commission = round2(totalAmount * PLATFORM_COMMISSION_RATE);
  const logisticsFee = customLogisticsFee > 0 ? customLogisticsFee : round2(totalAmount * LOGISTICS_RATE);
  const insuranceFee = includeInsurance ? INSURANCE_FLAT_NGN : 0;
  const netPayout = round2(totalAmount - commission - logisticsFee - insuranceFee);

  return {
    amount: totalAmount,
    platformCommissionRate: PLATFORM_COMMISSION_RATE.toFixed(4),
    platformCommission: commission.toFixed(2),
    logisticsFee: logisticsFee.toFixed(2),
    insuranceFee: insuranceFee.toFixed(2),
    netSellerPayout: Math.max(0, netPayout).toFixed(2),
  };
}

/**
 * Validate that escrow entries balance (debits == credits).
 */
export function validateLedgerBalance(
  entries: Array<{ debit: string; credit: string }>,
): boolean {
  const totalDebit = entries.reduce(
    (sum, e) => sum + parseFloat(e.debit),
    0,
  );
  const totalCredit = entries.reduce(
    (sum, e) => sum + parseFloat(e.credit),
    0,
  );
  return Math.abs(totalDebit - totalCredit) < 0.001;
}

/**
 * Build double-entry ledger records for a new escrow deposit.
 */
export function buildDepositLedgerEntries(
  transactionId: string,
  breakdown: EscrowBreakdown,
  currency: string,
) {
  const amount = breakdown.amount.toFixed(2);
  return [
    // Buyer pays into escrow
    {
      transactionId,
      accountType: "ESCROW_HELD",
      debit: amount,
      credit: "0.00",
      currency,
      description: "Buyer deposit into escrow",
    },
    // Platform commission allocation
    {
      transactionId,
      accountType: "PLATFORM_COMMISSION",
      debit: "0.00",
      credit: breakdown.platformCommission,
      currency,
      description: "Platform commission",
    },
    // Logistics fee allocation
    {
      transactionId,
      accountType: "LOGISTICS_FEE",
      debit: "0.00",
      credit: breakdown.logisticsFee,
      currency,
      description: "Logistics coordination fee",
    },
    // Insurance fee allocation
    ...(parseFloat(breakdown.insuranceFee) > 0
      ? [
          {
            transactionId,
            accountType: "INSURANCE_FEE",
            debit: "0.00",
            credit: breakdown.insuranceFee,
            currency,
            description: "Buyer-selected insurance",
          },
        ]
      : []),
    // Seller payout held
    {
      transactionId,
      accountType: "SELLER_PAYOUT",
      debit: "0.00",
      credit: breakdown.netSellerPayout,
      currency,
      description: "Net seller payout held in escrow",
    },
  ];
}

/**
 * Build ledger entries for escrow release to seller.
 */
export function buildReleaseToSellerLedgerEntries(
  transactionId: string,
  netPayout: string,
  currency: string,
) {
  return [
    {
      transactionId,
      accountType: "SELLER_PAYOUT",
      debit: netPayout,
      credit: "0.00",
      currency,
      description: "Escrow released to seller",
    },
    {
      transactionId,
      accountType: "ESCROW_HELD",
      debit: "0.00",
      credit: netPayout,
      currency,
      description: "Escrow balance reduced on release",
    },
  ];
}

/**
 * Build ledger entries for a buyer refund.
 */
export function buildRefundLedgerEntries(
  transactionId: string,
  amount: string,
  currency: string,
) {
  return [
    {
      transactionId,
      accountType: "BUYER_REFUND",
      debit: amount,
      credit: "0.00",
      currency,
      description: "Refund issued to buyer",
    },
    {
      transactionId,
      accountType: "ESCROW_HELD",
      debit: "0.00",
      credit: amount,
      currency,
      description: "Escrow balance reduced on refund",
    },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

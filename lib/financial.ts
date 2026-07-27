export const ACCRUED_TRANSACTION_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "COMPLETED",
] as const;

export function isAccruedTransactionStatus(status: string) {
  return ACCRUED_TRANSACTION_STATUSES.includes(
    status as (typeof ACCRUED_TRANSACTION_STATUSES)[number]
  );
}

// A payment can be refunded while the total refunded stays within what was captured.
export function canRefundPayment(capturedCents: number, refundedCents: number, wantedCents: number): boolean {
  return wantedCents > 0 && refundedCents + wantedCents <= capturedCents
}

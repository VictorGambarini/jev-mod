// Support agents may refund up to this much without a second approval.
export const AGENT_REFUND_LIMIT_CENTS = 20_000

export const needsApproval = (amountCents: number) => amountCents > AGENT_REFUND_LIMIT_CENTS

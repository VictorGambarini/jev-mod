import { expect, test, vi } from 'vitest'
import { refundPayment } from '../../src/payments/refunds'

vi.mock('../../src/lib/db/pool', () => ({ query: vi.fn().mockResolvedValue([{ captured_cents: 5000, refunded_cents: 0 }]) }))
vi.mock('../../src/payments/gateway/client', () => ({ gatewayPost: vi.fn().mockResolvedValue({ id: 'rf_1', paymentId: 'pay_1', amountCents: 1000, reason: 'x' }) }))

test('refunds part of a payment', async () => {
  const refund = await refundPayment('pay_1', 1000, 'customer asked')
  expect(refund.id).toBe('rf_1')
})

test('refuses more than was captured', async () => {
  await expect(refundPayment('pay_1', 9000, 'too much')).rejects.toThrow()
})

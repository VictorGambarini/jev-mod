import { expect, test, vi } from 'vitest'
import { cancelOrder } from '../../src/orders/cancel-order'
import { refundPayment } from '../../src/payments/refunds'

vi.mock('../../src/payments/refunds', () => ({ refundPayment: vi.fn() }))
vi.mock('../../src/lib/db/pool', () => ({ query: vi.fn().mockResolvedValue([{ payment_id: 'pay_9', total_cents: 4200, shipped_at: null }]) }))

test('cancelling an unshipped order refunds its payment in full', async () => {
  await cancelOrder('ord_1', 'changed my mind')
  expect(refundPayment).toHaveBeenCalledWith('pay_9', 4200, 'order cancelled: changed my mind')
})

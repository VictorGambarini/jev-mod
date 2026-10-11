import { openDispute } from '../../../disputes/open-dispute'

export async function onDisputeOpened(event: { data: { paymentId: string; reason: string } }) {
  await openDispute(event.data.paymentId, event.data.reason)
}

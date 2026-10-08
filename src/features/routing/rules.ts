// Routing's session rules: what lane a turn runs in given the turn before it, and which model
// a step may switch to. Plain functions, so the test kit can hold them to their word.

export const LANES = ['small', 'medium', 'high', 'escalate'] as const
export type LaneName = (typeof LANES)[number]

// How long a turn still counts as the previous one's follow-up.
export const FOLLOW_UP_MS = 30 * 60_000

// The person saying the last answer did not work. Read loosely; it can only raise a lane.
const CORRECTION = new RegExp(
  "\\b(wrong|incorrect|not right|not what i|doesn'?t work|didn'?t work|not working|does not work|" +
    'still (fails?|failing|broken|wrong|not)|broke|broken|regress|try again|fix (it|this|that)|' +
    "that'?s not|you missed|same (error|problem|issue))\\b",
  'i',
)

export type Previous = { lane: LaneName; at: number; corrections: number }

export function isCorrection(text: string): boolean {
  return CORRECTION.test(text)
}

function index(lane: string): number {
  const at = LANES.indexOf(lane as LaneName)
  return at < 0 ? 0 : at
}

/**
 * The lane this turn runs in, given what Jev classified and the turn before it.
 *
 * Within FOLLOW_UP_MS of the previous turn: the lane drops at most one step a turn (a short
 * follow-up of hard work is still hard work), a correction never drops below the previous
 * lane, and a second correction in a row climbs one. Jev's own lane wins whenever it is
 * higher. Outside the window the turn stands on its own.
 */
export function sessionLane(
  classified: LaneName | null, previous: Previous | null, text: string, now: number,
): { lane: LaneName | null; corrections: number; why: string } {
  const recent = previous !== null && now - previous.at <= FOLLOW_UP_MS
  if (!recent || previous === null) return { lane: classified, corrections: 0, why: 'classified' }
  const correction = isCorrection(text)
  const corrections = correction ? previous.corrections + 1 : 0
  const prev = index(previous.lane)
  const floor = correction ? Math.min(prev + (corrections >= 2 ? 1 : 0), LANES.length - 1) : Math.max(prev - 1, 0)
  if (classified !== null && index(classified) >= floor) return { lane: classified, corrections, why: 'classified' }
  return { lane: LANES[floor]!, corrections, why: correction ? 'correction' : 'follow-up' }
}

const RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2 }

export function modelRank(model: string): number {
  const family = Object.keys(RANK).find(name => model.includes(name))
  return family === undefined ? RANK.opus! : RANK[family]!
}

/**
 * The model for a step. Below `maxTokens` of context the lane's model, freely. Above it the
 * model only moves up: every switch re-reads the whole context uncached (the cache is per
 * model), worth paying once for a harder lane, never for a cheaper one.
 */
export function chooseModel(wanted: string | undefined, current: string, tokens: number, maxTokens: number): string {
  if (wanted === undefined || wanted === current) return current
  if (tokens < maxTokens) return wanted
  return modelRank(wanted) > modelRank(current) ? wanted : current
}

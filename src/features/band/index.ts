import { configured } from '../../core/config'
import type { IO } from '../../core/io'
import { ONBOARDING } from './line'

/** At session start, while the user's config file does not exist: one toast saying where to begin. Never throws. */
export async function onboard(io: IO): Promise<void> {
  try {
    if (!(await configured(io))) io.toast(ONBOARDING)
  } catch { /* a hint, nothing more */ }
}

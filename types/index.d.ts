// jev-mod's $.state contract: the band's view of this session's record, plus `mod.configured`
// (whether ~/.config/jev-mod/config.json exists yet; false shows the onboarding hint).
export type BandFeatures = Record<string, Record<string, unknown>>

// The access gate's allows for one session: held by the host for the session ($.state), never
// written to disk, so a new session starts with every category blocked again. `session` is the
// session they were given in; allows from any other session are not read.
export type AccessState = { session: string; grants: Record<string, { hosts?: string[] }> }

declare module 'claude-code' {
  interface PluginState {
    'jev-mod': { band: BandFeatures | null; access: AccessState | null }
  }
}

// jev-mod's $.state contract: the band's view of this session's record, plus `mod.configured`
// (whether ~/.config/jev-mod/config.json exists yet; false shows the onboarding hint).
export type BandFeatures = Record<string, Record<string, unknown>>

declare module 'claude-code' {
  interface PluginState {
    'jev-mod': { band: BandFeatures | null }
  }
}

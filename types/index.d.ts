// jev-mod's $.state contract: the band's view of this session's record.
export type BandFeatures = Record<string, Record<string, unknown>>

declare module 'claude-code' {
  interface PluginState {
    'jev-mod': { band: BandFeatures | null }
  }
}

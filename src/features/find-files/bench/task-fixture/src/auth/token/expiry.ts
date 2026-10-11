// Short-lived JWTs for the dashboard's websocket: valid for 15 minutes, with 30 seconds of clock skew allowed.
export const TOKEN_TTL_SECONDS = 900
const SKEW_SECONDS = 30

export function isTokenExpired(expSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds > expSeconds + SKEW_SECONDS
}

export const SEND_COOLDOWN_MS = 60000;
export const RATE_LIMIT_COOLDOWN_MS = 600000;
export const cooldownKey = "framework-auth-email-cooldown-v1";
export function readCooldown(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
) {
  try {
    const until = Number(storage.getItem(cooldownKey));
    return Number.isFinite(until) &&
      until > now &&
      until <= now + 24 * 60 * 60 * 1000
      ? until
      : 0;
  } catch {
    return 0;
  }
}

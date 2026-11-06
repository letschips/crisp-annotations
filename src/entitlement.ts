import type { LicenseVerifyResult } from "./license";

// Entitlement lives in module-private maps keyed by the plugin instance. Nothing on the instance
// (fields, methods, settings) can turn it on; only a verified license result applied here can.
const STATE = new WeakMap<object, boolean>();
const EXPIRY = new WeakMap<object, number>();
const LISTENERS = new WeakMap<object, (entitled: boolean) => void>();

function active(owner: object): boolean {
  if (STATE.get(owner) !== true) return false;
  const expiry = EXPIRY.get(owner);
  if (expiry === undefined || Date.now() < expiry) return true;
  STATE.set(owner, false);
  const listener = LISTENERS.get(owner);
  if (listener) setTimeout(() => listener(false), 0);
  return false;
}

/** The single gate every feature goes through. */
export function annotationsEntitled(owner: unknown): boolean {
  if (!owner || (typeof owner !== "object" && typeof owner !== "function")) return false;
  return active(owner as object);
}

/** Records a license check for this plugin and reports whether access changed. */
export function applyEntitlement(owner: object, result: LicenseVerifyResult): boolean {
  const before = active(owner);
  const valid = result.valid === true;
  STATE.set(owner, valid);
  const expiry = valid ? new Date(result.payload?.expiresAt ?? "").getTime() : Number.NaN;
  if (Number.isFinite(expiry)) EXPIRY.set(owner, expiry);
  else EXPIRY.delete(owner);
  const after = active(owner);
  if (before !== after) LISTENERS.get(owner)?.(after);
  return before !== after;
}

export function onEntitlementChange(owner: object, listener: (entitled: boolean) => void): void {
  LISTENERS.set(owner, listener);
}

"use client";

import { WebHaptics } from "web-haptics";

let _instance: WebHaptics | null = null;

function getInstance(): WebHaptics | null {
  if (typeof window === "undefined") return null;
  if (!_instance) {
    _instance = new WebHaptics();
  }
  return _instance;
}

/** Backward-compatible wrapper – keeps existing call-sites working. */
export function triggerHapticFeedback(duration = 12) {
  const h = getInstance();
  if (!h) return;
  h.trigger(duration);
}

/* ── Semantic presets ── */

/** Light tap for tab switches, toggles, selections */
export function hapticSelection() {
  const h = getInstance();
  if (!h) return;
  h.trigger("selection");
}

/** Success – saving notes/assignments, payment confirmed */
export function hapticSuccess() {
  const h = getInstance();
  if (!h) return;
  h.trigger("success");
}

/** Error – validation failures, payment failures */
export function hapticError() {
  const h = getInstance();
  if (!h) return;
  h.trigger("error");
}

/** Warning – soft alert, cancellation */
export function hapticWarning() {
  const h = getInstance();
  if (!h) return;
  h.trigger("warning");
}

/** Nudge – confirmations, notable actions */
export function hapticNudge() {
  const h = getInstance();
  if (!h) return;
  h.trigger("nudge");
}

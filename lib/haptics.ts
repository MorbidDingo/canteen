"use client";

export function triggerHapticFeedback(duration = 12) {
  if (typeof window === "undefined") return;
  if (!("vibrate" in navigator)) return;
  navigator.vibrate(duration);
}

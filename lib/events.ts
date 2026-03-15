"use client";

import { useEffect, useRef, useCallback } from "react";

// ─── Event Types ─────────────────────────────────────────
export type AppEvent =
  | "orders-updated"
  | "menu-updated"
  | "library-updated"
  | "gate-tap"
  | "parent-notification";

// ─── Client-side event emitter (fires server broadcast) ──
/**
 * Emit an event: POSTs to the server which broadcasts to all
 * connected SSE clients (including other tabs/devices).
 */
export async function emitEvent(event: AppEvent) {
  try {
    await fetch("/api/events/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
  } catch {
    // Non-critical — the local fetch still updates the current page
  }
}

// ─── SSE Connection (singleton) ──────────────────────────
type SSECallback = (payload?: unknown) => void;
const sseListeners = new Map<AppEvent, Set<SSECallback>>();

function getSSEListeners(event: AppEvent) {
  if (!sseListeners.has(event)) {
    sseListeners.set(event, new Set());
  }
  return sseListeners.get(event)!;
}

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

// ─── Polling fallback ────────────────────────────────────
// When SSE fails repeatedly, we fire synthetic events on a
// timer so that hooks calling useRealtimeData still refresh.
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    // Fire a synthetic refresh for every registered event type
    for (const [event, fns] of sseListeners) {
      if (fns.size > 0) {
        fns.forEach((fn) => fn(undefined));
      }
      void event; // used in iteration
    }
  }, 10_000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function connectSSE() {
  if (typeof window === "undefined") return;
  if (eventSource) return;

  eventSource = new EventSource("/api/events");

  eventSource.onopen = () => {
    reconnectAttempts = 0;
    stopPolling();
  };

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      const event = data.type as AppEvent;
      const fns = getSSEListeners(event);
      fns.forEach((fn) => fn(data.payload));
    } catch {
      // Ignore non-JSON messages (heartbeats, comments)
    }
  };

  eventSource.onerror = () => {
    // Connection lost — close and reconnect with exponential backoff
    eventSource?.close();
    eventSource = null;

    if (refCount > 0) {
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY,
      );
      reconnectAttempts++;
      reconnectTimer = setTimeout(connectSSE, delay);

      // After several failed attempts, start polling as a fallback
      if (reconnectAttempts >= 3) {
        startPolling();
      }
    }
  };
}

function disconnectSSE() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  stopPolling();
  reconnectAttempts = 0;
}

// ─── Hooks ───────────────────────────────────────────────

/**
 * Subscribe to server-sent events. Opens an SSE connection (shared
 * across all hooks) and calls `onEvent` whenever the specified event
 * is broadcast by the server.
 */
export function useSSE(event: AppEvent, onEvent: (payload?: unknown) => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const handler = (payload?: unknown) => callbackRef.current(payload);
    const fns = getSSEListeners(event);
    fns.add(handler);

    // Manage shared SSE connection lifecycle
    refCount++;
    connectSSE();

    return () => {
      fns.delete(handler);
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        disconnectSSE();
      }
    };
  }, [event]);
}

/**
 * Convenience: re-fetch instantly whenever the server broadcasts
 * the given event via SSE. No polling needed.
 */
export function useRealtimeData(
  fetchFn: () => Promise<void>,
  event: AppEvent,
) {
  const fetchRef = useRef(fetchFn);

  useEffect(() => {
    fetchRef.current = fetchFn;
  });

  const stableFetch = useCallback(() => {
    fetchRef.current();
  }, []);

  // Re-fetch instantly on SSE event
  useSSE(event, stableFetch);
}

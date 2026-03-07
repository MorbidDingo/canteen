"use client";

import { useEffect, useRef, useCallback } from "react";

// ─── Event Types ─────────────────────────────────────────
export type AppEvent = "orders-updated" | "menu-updated";

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
type SSECallback = () => void;
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

function connectSSE() {
  if (typeof window === "undefined") return;
  if (eventSource) return;

  eventSource = new EventSource("/api/events");

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      const event = data.type as AppEvent;
      const fns = getSSEListeners(event);
      fns.forEach((fn) => fn());
    } catch {
      // Ignore non-JSON messages (heartbeats, comments)
    }
  };

  eventSource.onerror = () => {
    // Connection lost — close and reconnect after a delay
    eventSource?.close();
    eventSource = null;

    if (refCount > 0) {
      reconnectTimer = setTimeout(connectSSE, 3_000);
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
}

// ─── Hooks ───────────────────────────────────────────────

/**
 * Subscribe to server-sent events. Opens an SSE connection (shared
 * across all hooks) and calls `onEvent` whenever the specified event
 * is broadcast by the server.
 */
export function useSSE(event: AppEvent, onEvent: () => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const handler = () => callbackRef.current();
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
  fetchRef.current = fetchFn;

  const stableFetch = useCallback(() => {
    fetchRef.current();
  }, []);

  // Re-fetch instantly on SSE event
  useSSE(event, stableFetch);
}

// Server-side event emitter for SSE push notifications.
// This runs only on the server — API routes call `broadcast()` after mutations,
// and the SSE endpoint streams events to all connected clients.
//
// Uses globalThis to guarantee a single Set across all module instances in the
// Node.js process.  Without this, Next.js production builds can create separate
// module scopes for different route bundles, causing broadcast() to write into a
// different Set than the one the SSE endpoint reads from.

export type AppEvent =
  | "orders-updated"
  | "menu-updated"
  | "library-updated"
  | "gate-tap"
  | "parent-notification";

export type AppEventMessage = {
  type: AppEvent;
  payload?: unknown;
};

type Listener = (event: AppEventMessage) => void;

const globalForSSE = globalThis as unknown as {
  __sseClients?: Set<Listener>;
};

if (!globalForSSE.__sseClients) {
  globalForSSE.__sseClients = new Set<Listener>();
}

const clients: Set<Listener> = globalForSSE.__sseClients;

/** Register an SSE client to receive events */
export function addClient(listener: Listener) {
  clients.add(listener);
}

/** Remove an SSE client */
export function removeClient(listener: Listener) {
  clients.delete(listener);
}

/** Broadcast an event to ALL connected SSE clients */
export function broadcast(event: AppEvent, payload?: unknown) {
  const message: AppEventMessage = { type: event, payload };
  clients.forEach((fn) => fn(message));
}

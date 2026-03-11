// Server-side event emitter for SSE push notifications.
// This runs only on the server — API routes call `broadcast()` after mutations,
// and the SSE endpoint streams events to all connected clients.

export type AppEvent = "orders-updated" | "menu-updated" | "library-updated";

type Listener = (event: AppEvent) => void;

const clients = new Set<Listener>();

/** Register an SSE client to receive events */
export function addClient(listener: Listener) {
  clients.add(listener);
}

/** Remove an SSE client */
export function removeClient(listener: Listener) {
  clients.delete(listener);
}

/** Broadcast an event to ALL connected SSE clients */
export function broadcast(event: AppEvent) {
  clients.forEach((fn) => fn(event));
}

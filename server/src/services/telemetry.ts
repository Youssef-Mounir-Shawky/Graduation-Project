import type { Node, Reading } from "../domain/types.js";

export const NODE_ONLINE_WINDOW_MS = 5 * 60_000;

export function isNodeOnline(node: Node | null): boolean {
  return node?.lastSeenAt !== null
    && node?.lastSeenAt !== undefined
    && Date.now() - Date.parse(node.lastSeenAt) < NODE_ONLINE_WINDOW_MS;
}

export function isReadingFresh(reading: Reading): boolean {
  return Date.now() - Date.parse(reading.timestamp) < NODE_ONLINE_WINDOW_MS;
}

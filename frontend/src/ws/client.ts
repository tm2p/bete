import type { MessageRecord } from "../api/client";

export type DashboardEvent =
  | { type: "message_created"; data: MessageRecord }
  | { type: "message_updated"; data: Partial<MessageRecord> & { id: string } }
  | { type: "message_deleted"; data: { id: string; deleted_at: number } }
  | { type: "message_analyzed"; data: MessageRecord }
  | { type: "analysis_queue_status"; data: unknown }
  | { type: "ui_state"; state: unknown }
  | { type: "user_state"; users: unknown[] };

export function connectDashboardSocket(
  onEvent: (event: DashboardEvent) => void,
): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  const ws = new WebSocket(url);

  ws.addEventListener("message", (evt) => {
    if (typeof evt.data === "string") {
      try {
        const event = JSON.parse(evt.data) as DashboardEvent;
        onEvent(event);
      } catch {
        // ignore malformed JSON
      }
    }
    // Binary frames (PCM audio) are ignored for now
  });

  return ws;
}
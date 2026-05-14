import { useEffect, useRef, useState } from "react";
import { listMessages, reanalyzeMessage } from "./api/client";
import { connectDashboardSocket } from "./ws/client";
import type { DashboardEvent, MessageRecord } from "./api/client";
import { MessageFeed } from "./components/messages/MessageFeed";
import { ReviewPanel } from "./components/review/ReviewPanel";

export default function App() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [wsStatus, setWsStatus] = useState<string>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    listMessages(new URLSearchParams({ limit: "30" }))
      .then((result) => {
        if (!cancelled) {
          setMessages(result.data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load messages:", err);
        }
      });

    const ws = connectDashboardSocket((event: DashboardEvent) => {
      switch (event.type) {
        case "message_created":
          setMessages((prev) => [event.data, ...prev].slice(0, 200));
          break;
        case "message_analyzed":
          setMessages((prev) =>
            prev.map((m) => (m.id === event.data.id ? event.data : m)),
          );
          break;
        case "message_updated":
          setMessages((prev) =>
            prev.map((m) => (m.id === event.data.id ? { ...m, ...event.data } : m)),
          );
          break;
        case "message_deleted":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.data.id ? { ...m, type: "deleted" as const } : m,
            ),
          );
          break;
      }
    });

    wsRef.current = ws;

    ws.addEventListener("open", () => setWsStatus("connected"));
    ws.addEventListener("close", () => setWsStatus("disconnected"));
    ws.addEventListener("error", () => setWsStatus("error"));

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const handleReanalyze = async (id: string) => {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, ai_status: "pending" as const, ai_error: null, ai_analysis: null }
          : m,
      ),
    );

    try {
      await reanalyzeMessage(id);
    } catch (err) {
      console.error("Reanalyze failed:", err);
      // Revert optimistic update on failure
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, ai_status: "error" as const, ai_error: "Reanalyze failed" } : m,
        ),
      );
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">Moderation</div>
        <div className="sidebar-placeholder">Channels placeholder</div>
      </div>

      <div className="main">
        <div className="header">
          <h1>Discord Moderation Dashboard</h1>
          <span className="ws-status" data-status={wsStatus}>
            {wsStatus}
          </span>
        </div>

        <div className="content">
          <MessageFeed messages={messages} onReanalyze={handleReanalyze} />
        </div>

        <ReviewPanel messages={messages} onReanalyze={handleReanalyze} />
      </div>
    </div>
  );
}

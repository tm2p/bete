import { useEffect, useRef, useState } from "react";
import { listMessages } from "./api/client";
import type { DashboardMessage } from "./api/client";
import { connectDashboardSocket } from "./ws/client";
import type { DashboardEvent } from "./ws/client";

interface MessageItem {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: number;
  type: "text" | "edited" | "deleted";
}

export default function App() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
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
          <div className="message-list">
            {messages.length === 0 ? (
              <p className="empty-state">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message-item type-${msg.type}`}>
                  <img
                    src={msg.avatar_url ?? "/default-avatar.png"}
                    alt={msg.username}
                    className="message-avatar"
                    width={32}
                    height={32}
                  />
                  <div className="message-body">
                    <span className="message-username">{msg.username}</span>
                    <span className="message-time">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                    {msg.type === "deleted" && (
                      <span className="message-deleted">[deleted]</span>
                    )}
                    <p className="message-content">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="review-panel">
          <div className="review-placeholder">Review placeholder</div>
        </div>
      </div>
    </div>
  );
}

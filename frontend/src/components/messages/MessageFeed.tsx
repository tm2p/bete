import type { MessageRecord } from "../../api/client";
import { MessageCard } from "./MessageCard";

export interface MessageFeedProps {
  messages: MessageRecord[];
  onReanalyze: (id: string) => void;
}

export function MessageFeed({ messages, onReanalyze }: MessageFeedProps) {
  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <p>No messages yet</p>
      </div>
    );
  }

  return (
    <div className="message-feed">
      {messages.map((msg) => (
        <MessageCard key={msg.id} message={msg} onReanalyze={onReanalyze} />
      ))}
    </div>
  );
}

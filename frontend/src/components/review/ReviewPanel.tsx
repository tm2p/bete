import type { MessageRecord } from "../../api/client";
import { MessageCard } from "../messages/MessageCard";

export interface ReviewPanelProps {
  messages: MessageRecord[];
  onReanalyze: (id: string) => void;
}

export function ReviewPanel({ messages, onReanalyze }: ReviewPanelProps) {
  const reviewItems = messages.filter(
    (m) =>
      m.ai_status === "warn" ||
      m.ai_status === "flagged" ||
      m.ai_status === "error",
  );

  return (
    <div className="review-panel">
      <div className="review-header">
        <h2>Needs Review</h2>
        <span className="review-count">{reviewItems.length}</span>
      </div>

      {reviewItems.length === 0 ? (
        <div className="empty-state">
          <p>No items to review</p>
        </div>
      ) : (
        <div className="review-list">
          {reviewItems.map((msg) => (
            <MessageCard key={msg.id} message={msg} onReanalyze={onReanalyze} />
          ))}
        </div>
      )}
    </div>
  );
}
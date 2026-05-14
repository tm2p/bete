import type { MessageRecord } from "../../api/client";

export interface MessageCardProps {
  message: MessageRecord;
  onReanalyze: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f9e2af",
  clean: "#a6e3a1",
  warn: "#fab387",
  flagged: "#f38ba8",
  error: "#f38ba8",
};

export function MessageCard({ message, onReanalyze }: MessageCardProps) {
  const displayContent = message.edited_content ?? message.content;
  const aiStatus = message.ai_status ?? "pending";
  const statusColor = STATUS_COLORS[aiStatus] ?? "#6c7086";

  return (
    <div className={`message-card type-${message.type}`}>
      <img
        src={message.avatar_url ?? "/default-avatar.png"}
        alt={message.username}
        className="message-card-avatar"
        width={32}
        height={32}
      />
      <div className="message-card-body">
        <div className="message-card-meta">
          <span className="message-card-username">{message.username}</span>
          <span className="message-card-time">
            {new Date(message.created_at).toLocaleString()}
          </span>
          {message.type === "edited" && (
            <span className="badge badge-edited">edited</span>
          )}
          {message.type === "deleted" && (
            <span className="badge badge-deleted">deleted</span>
          )}
          <span
            className="badge badge-ai"
            style={{ backgroundColor: statusColor }}
            title={`AI: ${aiStatus}`}
          >
            {aiStatus}
          </span>
        </div>

        <p className="message-card-content">{displayContent}</p>

        {message.ai_analysis && (
          <div className="message-card-analysis">{message.ai_analysis}</div>
        )}

        {message.ai_error && (
          <div className="message-card-error">{message.ai_error}</div>
        )}

        <div className="message-card-actions">
          <button
            type="button"
            className="btn-reanalyze"
            onClick={() => onReanalyze(message.id)}
            disabled={aiStatus === "pending"}
          >
            Reanalyze
          </button>
        </div>
      </div>
    </div>
  );
}

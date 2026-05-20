import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface VoiceRecording {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string | null;
  upload_status: "pending" | "uploaded" | "failed";
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function RecordingsPanel() {
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecordings() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/recordings");
        if (!response.ok) {
          throw new Error(`Failed to load recordings: ${response.status}`);
        }
        const data = (await response.json()) as VoiceRecording[];
        if (!cancelled) setRecordings(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecordings();
    window.addEventListener("voice_recording_uploaded", loadRecordings);

    return () => {
      cancelled = true;
      window.removeEventListener("voice_recording_uploaded", loadRecordings);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Recordings</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Loading recordings...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-destructive p-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : recordings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No recordings found.
          </div>
        ) : (
          <div className="space-y-3">
            {recordings.map((recording) => (
              <div
                key={recording.id}
                className="rounded-xl border border-border bg-background/60 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{recording.filename}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {recording.username} · {recording.channel_name ?? recording.channel_id ?? "unknown channel"} · {formatDate(recording.created_at)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(recording.size_bytes)} · {recording.upload_status}
                    </div>
                    {recording.upload_error ? (
                      <div className="mt-2 text-xs text-destructive">
                        {recording.upload_error}
                      </div>
                    ) : null}
                  </div>
                  {recording.download_url ? (
                    <a
                      href={recording.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
                    >
                      Download
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

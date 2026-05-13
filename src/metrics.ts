import { Counter, Gauge, Histogram, register } from "prom-client";

// Audio metrics
export const audioLevelGauge = new Gauge({
  name: "audio_level_db",
  help: "Current audio level in dB",
  labelNames: ["user_id"],
});

export const recordingDurationCounter = new Counter({
  name: "recording_duration_seconds_total",
  help: "Total recording duration in seconds",
  labelNames: ["user_id"],
});

export const activeRecordingsGauge = new Gauge({
  name: "active_recordings",
  help: "Number of active recordings",
});

export const recordedSegmentsCounter = new Counter({
  name: "recorded_segments_total",
  help: "Total number of recorded segments",
  labelNames: ["user_id"],
});

// Connection metrics
export const voiceConnectionsGauge = new Gauge({
  name: "voice_connections_active",
  help: "Number of active voice connections",
});

export const connectionErrorsCounter = new Counter({
  name: "connection_errors_total",
  help: "Total number of connection errors",
  labelNames: ["error_type"],
});

export const reconnectAttemptsCounter = new Counter({
  name: "reconnect_attempts_total",
  help: "Total number of reconnection attempts",
});

// WebSocket metrics
export const wsClientsGauge = new Gauge({
  name: "websocket_clients_connected",
  help: "Number of connected WebSocket clients",
});

export const wsMessagesCounter = new Counter({
  name: "websocket_messages_total",
  help: "Total WebSocket messages sent",
  labelNames: ["message_type"],
});

// HTTP metrics
export const httpRequestDurationHistogram = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
});

export const httpRequestsCounter = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

// System metrics
export const uptimeGauge = new Gauge({
  name: "process_uptime_seconds",
  help: "Process uptime in seconds",
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}

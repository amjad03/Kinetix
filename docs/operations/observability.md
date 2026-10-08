# Observability

Code: `services/api/src/observability/`. Complements `monitoring.md` (probes and CloudWatch alarms).

## Structured logs

`LOG_FORMAT=json` (default in deployed environments) writes one JSON object per line with
`level`, `msg`, `requestId`, and `traceId` / `spanId` when a trace is active. `text` is for local
development. Every response carries `x-request-id`; a sane incoming `x-request-id` is reused so a
request can be followed across services.

## Metrics

`GET /metrics` serves Prometheus text format (0.0.4) from an in-process registry. When
`METRICS_TOKEN` is set the request needs `Authorization: Bearer <token>`; otherwise restrict it at
the load balancer (it is not meant to be public).

| Metric | Type | Labels |
| --- | --- | --- |
| `kinetix_http_requests_total` | counter | method, route, status class |
| `kinetix_http_request_duration_seconds` | histogram | method, route |
| `kinetix_domain_events_total` | counter | type, outcome |
| `kinetix_report_runs_total` | counter | report, outcome |
| `kinetix_upload_scans_total` | counter | outcome |
| `kinetix_process_uptime_seconds`, `kinetix_process_resident_memory_bytes` | gauge | none |

Counters are per process; scrape every task and sum in the query.

## Traces

Minimal OpenTelemetry: W3C `traceparent` is accepted and propagated, and spans are exported as
OTLP/HTTP JSON to `OTEL_EXPORTER_OTLP_ENDPOINT` (for example `http://otel-collector:4318`). Unset
(or empty) means no tracing and no overhead. `OTEL_SERVICE_NAME` names the service;
`OTEL_TRACES_SAMPLER_ARG` (0 to 1) is the head-sampling fraction, and a caller's sampling decision
in `traceparent` is honoured. Terraform: `otel_exporter_endpoint`. Compose: `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Upload scanning

`UPLOAD_SCAN=clamav` with `CLAMAV_HOST` / `CLAMAV_PORT` (default 3310) quarantines uploaded vault
documents until clamd reports clean; see `docs/architecture/platform-foundation.md`. Terraform:
`upload_scan`, `clamav_host`. Alert on a rising `kinetix_upload_scans_total{outcome="error"}`
(scanner unreachable, files stay quarantined and are retried).

## Not yet done

No dashboards or alert rules on the new metrics ship in Terraform; no log shipping beyond
CloudWatch; no tracing of outbound database calls.

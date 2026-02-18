# Operations Agent - Observability

## Logging

### Logger: Pino

High-performance JSON logger optimized for production.

### Log Levels

- `fatal`: Application crash
- `error`: Operation failed
- `warn`: Potential issue
- `info`: Normal operations
- `debug`: Detailed debugging
- `trace`: Very detailed

### Configuration

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment ? { target: "pino-pretty" } : undefined,
});
```

### Structured Logs

```json
{
  "level": 30,
  "time": 1705312800000,
  "msg": "Message processed",
  "correlationId": "abc-123",
  "merchantId": "demo-merchant",
  "conversationId": "conv-456",
  "action": "update_cart",
  "processingTimeMs": 1250,
  "tokenUsage": 850
}
```

### PII Masking

Phone numbers automatically masked:

```
01234567890 → 012****890
```

## Correlation IDs

Every request gets a unique correlation ID:

```typescript
@Injectable()
export class CorrelationIdMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.correlationId = req.headers["x-correlation-id"] || uuidv4();
    res.setHeader("x-correlation-id", req.correlationId);
    next();
  }
}
```

Propagated through:

- Log entries
- Database events
- Outbox events
- Error reports

## Metrics

### Available Metrics

| Metric               | Type      | Description              |
| -------------------- | --------- | ------------------------ |
| `messages_total`     | Counter   | Total messages processed |
| `orders_created`     | Counter   | Orders created           |
| `token_usage_total`  | Counter   | OpenAI tokens used       |
| `processing_time_ms` | Histogram | Message processing time  |
| `dlq_events`         | Gauge     | Events in DLQ            |

### Admin Metrics Endpoint

```
GET /api/v1/admin/metrics

{
  "merchants": { "total": 5, "active": 4 },
  "orders": { "total": 150, "pending": 12, "delivered": 98 },
  "conversations": { "total": 500, "today": 25 },
  "messages": { "total": 3000, "totalTokens": 450000 },
  "events": { "pending": 5, "processed": 2500, "failed": 3 },
  "dlq": { "totalPending": 2 }
}
```

## Health Checks

### Liveness

```
GET /health

{ "status": "ok", "timestamp": "2024-01-15T10:00:00Z" }
```

### Readiness

```
GET /ready

{ "status": "ready", "timestamp": "2024-01-15T10:00:00Z" }
```

### Kubernetes Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Error Tracking

### Exception Filter

All exceptions logged with context:

```typescript
@Catch()
export class AllExceptionsFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    logger.error({
      exception:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: exception.stack,
            }
          : exception,
      request: {
        method: request.method,
        url: request.url,
        correlationId: request.correlationId,
      },
    });
  }
}
```

### Integration with External Services

Recommended integrations:

- **Sentry**: Error tracking
- **Datadog**: APM and logs
- **Azure Application Insights**: Full observability

## Event Tracing

### Outbox Events

Every event includes:

```json
{
  "eventId": "evt-123",
  "eventType": "OrderCreated",
  "aggregateType": "order",
  "aggregateId": "ord-456",
  "merchantId": "demo",
  "correlationId": "corr-789",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

### Event Status Tracking

```sql
SELECT status, COUNT(*)
FROM outbox_events
GROUP BY status;

-- pending: 5
-- processed: 2500
-- failed: 10
-- dlq: 2
```

## Performance Monitoring

### Key Metrics to Track

1. **Message Processing Time**: Target < 2s
2. **LLM Latency**: Target < 1.5s
3. **Database Query Time**: Target < 100ms
4. **Event Processing Time**: Target < 500ms

### Database Monitoring

```sql
-- Slow queries
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## Alerting

### Recommended Alerts

| Alert                 | Condition       | Severity |
| --------------------- | --------------- | -------- |
| High DLQ count        | DLQ events > 10 | Warning  |
| LLM errors            | Error rate > 5% | Error    |
| Token budget exceeded | Any merchant    | Info     |
| Processing time       | p99 > 5s        | Warning  |
| Database connections  | Pool exhausted  | Critical |

### Example Alert (Prometheus)

```yaml
groups:
  - name: operations-agent
    rules:
      - alert: HighDlqCount
        expr: dlq_events_total > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High number of events in DLQ"
```

## Dashboard

### Recommended Panels

1. **Request Rate**: Messages per minute
2. **Error Rate**: Errors per minute
3. **Latency**: p50, p95, p99
4. **Token Usage**: By merchant, over time
5. **Order Funnel**: Conversations → Carts → Orders
6. **DLQ Status**: Pending events count

### Grafana Example

```json
{
  "title": "Message Processing",
  "panels": [
    {
      "title": "Requests/min",
      "targets": [{ "expr": "rate(messages_total[1m])" }]
    },
    {
      "title": "Latency p99",
      "targets": [{ "expr": "histogram_quantile(0.99, processing_time_ms)" }]
    }
  ]
}
```

## Log Aggregation

### ELK Stack Configuration

```yaml
# Filebeat input
filebeat.inputs:
  - type: container
    paths:
      - '/var/lib/docker/containers/*/*.log'
    json.keys_under_root: true
    json.add_error_key: true

# Logstash filter
filter {
  json {
    source => "message"
  }
  if [level] == 30 {
    mutate { replace => { "level" => "info" } }
  }
}
```

## Runbook

### High DLQ Count

1. Check `/api/v1/admin/dlq` for events
2. Review error messages
3. Fix underlying issue
4. Replay with `POST /api/v1/admin/replay/:id`

### Token Budget Exceeded

1. Check merchant's daily usage
2. Increase budget if needed
3. Review for potential abuse

### Slow Processing

1. Check database query times
2. Review LLM latency
3. Check Redis connectivity
4. Scale horizontally if needed

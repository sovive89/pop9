# Local Print Server

Local service that runs inside each restaurant network and prints thermal tickets for jobs created in the cloud backend.

## Architecture

1. `PrintServerService` polls cloud `print_jobs`.
2. Jobs are filtered by `restaurant_id`.
3. `JobRepository.lockJob()` atomically transitions `PENDING/FAILED -> PROCESSING`.
4. `JobProcessor` fetches printer config from `printers`.
5. `EscPosFormatter` transforms job payload into ESC/POS bytes.
6. `TcpEscPosPrinterClient` sends bytes to printer `ip_address:port`.
7. Job is finalized as `PRINTED` or `FAILED` with retry increment.

### Reliability controls

- Atomic lock per job (`status` check in update query)
- Retry count control (`retry_count < MAX_RETRIES`)
- Poll loop reconnect (errors are logged and loop continues)
- TCP timeout and offline detection
- Per-job structured logs

## Project structure

```text
print-server/
├─ config/
├─ printers/
├─ jobs/
├─ formatters/
├─ services/
└─ utils/
```

Implemented under `src/` following the same domains.

## Environment

Copy `.env.example` and set variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESTAURANT_ID`
- Optional tuning: poll interval, retries, timeouts

## Run

```bash
npm --prefix print-server start
```

## Tests

```bash
npm --prefix print-server test
```

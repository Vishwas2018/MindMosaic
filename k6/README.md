# k6 Load Tests

## session-loop.js

500 VU ramp test for the assessment-svc session loop (create → respond × N → submit).

### Requirements

- [k6](https://k6.io/docs/getting-started/installation/) installed locally
- A running Supabase project with seeded data (pathway, framework_config, items)
- A valid student JWT (`TOKEN`)

### Run locally

```bash
BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1 \
TOKEN=<student-jwt> \
PATHWAY_ID=<uuid> \
k6 run k6/session-loop.js
```

### Thresholds (BUILD_CONTRACT §10)

| Metric                  | Budget p95 |
|-------------------------|-----------|
| session_create_latency  | 300 ms    |
| session_respond_latency | 300 ms    |
| session_submit_latency  | 5000 ms   |
| http_req_failed         | < 1 %     |

### CI

The nightly load-test workflow (`.github/workflows/load-test.yml`) runs this script
when `BASE_URL` and `TOKEN` secrets are configured in the GitHub repository.
It skips gracefully when secrets are absent (pre-deploy gate is not yet open).

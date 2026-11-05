# Store Order Manager

A small React + TypeScript frontend and Express + TypeScript API for one-warehouse stock and customer orders. SQLite persists inventory and orders.

## Run and test

Requirements: Node.js 20+ and npm. From the repository root:

```bash
npm install
npm run install:all
npm run dev
```

Open `http://localhost:5173`; the API is at `http://localhost:4000/api`. The SQLite file is created as `backend/data.sqlite`. To run backend tests: `npm --prefix backend test`. For the browser test, install Playwright's Chromium once with `cd frontend && npx playwright install chromium`, then run `npm --prefix frontend run test:e2e`. Build both parts with `npm run build`.

## Decisions and trade-offs

- SQLite was chosen for lightweight durable storage with no separate database service. Foreign keys, CHECK constraints, and a unique idempotency key protect core invariants.
- Order placement runs in one synchronous SQLite transaction: all products are checked before any stock is decremented, then the order and lines are inserted together. SQLite serializes writes, preventing two requests from reserving the same last unit. A failed transaction rolls back all changes.
- Clients must send `Idempotency-Key` on order creation. Retrying the same request with the same key returns the original order rather than reserving stock again.
- An order is cancellable only while `PLACED`; cancellation restores every line's stock in one transaction. Shipping changes `PLACED` to `SHIPPED`, after which cancellation is rejected.
- No authentication is implemented because the brief says it is not required. Staff controls are therefore visible in the demo. Prices are stored as REAL for simplicity; production systems should use integer minor currency units.
- The UI is intentionally minimal. More time would go to authentication/authorization, request fingerprint validation for idempotency keys, pagination, stronger accessibility, migration tooling, structured logging, and load/concurrency tests.

## AI assistance

OpenAI ChatGPT was used to help scaffold the project, draft the API/UI, tests, and this README. The implementation and design choices should be reviewed and understood before submission; generated code must be validated locally and adjusted as needed.

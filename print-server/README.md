# POP9 Print Server (prototype)

This is an **initial TCP ESC/POS worker**, not a production-ready Windows installer. It runs on a trusted Windows PC with Node.js 20+, or on a small always-on device. QZ Tray is **not** required for network printers.

## Setup
1. Install Node.js 20+ and run `npm install` in this directory.
2. Copy `.env.example` to `.env`. Load the variables into the process environment (Node 20+: `node --env-file=.env src/index.mjs`).
3. Create a dedicated Supabase Auth account for the agent, authorize it for exactly one business unit using the existing unit membership model, and configure that unit UUID.
4. Apply the accompanying SQL migration **after reviewing its RLS and permissions against the project's actual membership schema**.
5. Start with `node --env-file=.env src/index.mjs`. Keep the process running on the print host.

**Important:** Do not use a Supabase service-role key in this application. The prototype supports TCP printers only; USB/Windows spooler, retry policies, installer, service auto-start, print-job creation from orders, and device health monitoring are not implemented.

The agent reads jobs from `claim_print_jobs` and acknowledges via `complete_print_job`. It never exposes an inbound LAN port. Its printer payload is UTF-8 text; proper ESC/POS codepages and binary-safe receipts require further work before production.

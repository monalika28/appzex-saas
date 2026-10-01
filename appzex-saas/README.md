# AppZex AgencyFlow — Full Stack Developer Assignment MVP

A multi-tenant agency project management SaaS starter built with Next.js, Node.js/Express, Prisma and MySQL. Includes role-aware login, tenant-scoped APIs, clients/projects/tasks, feedback, activity, platform-level Super Admin APIs, and an AI client-update endpoint with graceful fallback.

## Run locally
1. Install Node.js 20+ and MySQL 8+.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and `JWT_SECRET`.
3. In `backend`: `npm install`, `npx prisma generate`, `npx prisma migrate dev --name init`, `npm run seed`, `npm run dev`.
4. In `frontend`: `npm install`, copy `.env.example` to `.env.local`, then `npm run dev`.
5. Open http://localhost:3000. API defaults to http://localhost:4000.

## Demo logins
- Super Admin: `admin@appzex.test` / `Admin123!`
- Agency Admin: `owner@bright.test` / `Agency123!`
- Agency Team: `dev@bright.test` / `Agency123!`
- Client: `client@north.test` / `Client123!`
- Second agency owner: `owner@pixel.test` / `Agency123!`

## Architecture and security notes
- MySQL stores all operational records with an `agencyId` where applicable.
- JWT authentication identifies the user; API middleware checks role and resolves tenant scope from the authenticated user, never from a client-supplied agency ID.
- Client access is scoped to the authenticated client's company and projects.
- Super Admin routes are separate and require `SUPER_ADMIN`. Agency suspension blocks agency members and client users.
- Passwords are bcrypt-hashed. Never commit `.env` or API secrets.
- AI endpoint accepts only an authorized project's recent activity and uses `OPENAI_API_KEY` when configured; otherwise it returns a transparent deterministic draft.
- This is an MVP foundation, not a fully audited production system. Before production, add rate limiting, refresh-token/session revocation, schema validation, secure object storage with permission-checked downloads, automated authorization tests, logging/monitoring, and deployment configuration.

## Scope
Core CRUD and role separation are implemented as a focused MVP. Billing, email invitations, file object storage, granular configurable team permissions, and production deployment are not included. Deploy backend and frontend separately and configure environment variables before sharing a live URL.

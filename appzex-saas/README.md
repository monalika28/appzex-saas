# AppZex AgencyFlow — Full Stack Developer Assignment MVP

A multi-tenant agency project management SaaS MVP built with Next.js 15, React, Node.js/Express, TypeScript, Prisma and MySQL. It provides separate Super Admin, agency and client experiences, with tenant-scoped APIs for clients, projects, tasks, feedback, meetings, team members and AI-assisted client updates.

## Live demo

- Frontend: https://appzex-saas-ten.vercel.app
- API health: https://appzex-saas-production.up.railway.app/api/health
- Source: https://github.com/monalika28/appzex-saas

The hosted application reflects the latest merged production deployment. Changes in an unmerged feature branch are not included in the live app until reviewed, merged and redeployed.

## Features

- **Super Admin:** platform metrics, agency listing/search, agency detail endpoint, agency creation with an initial admin, and agency activation/suspension.
- **Agency workspace:** tenant-scoped client and project management, task creation/status updates, feedback tracking, meeting creation and team directory. The UI supports creating tasks and updating project/task statuses.
- **Team management:** agency admins can create Agency Team accounts; passwords are bcrypt-hashed and users are scoped to their agency.
- **Client portal:** project and task progress, client-scoped feedback submission and only client-visible meetings/activity. Agency admins can create a client portal account when adding a client by setting a password; share the credentials securely.
- **AI update draft:** generates a concise project update with OpenAI when configured, with a deterministic fallback when no key is configured or the AI request fails.
- **Access control:** JWT authentication, role checks, tenant scope taken from the authenticated user, and agency status checks.

## Run locally

1. Install Node.js 20+ and MySQL 8+.
2. Copy `backend/.env.example` to `backend/.env`; configure `DATABASE_URL` and a long, random `JWT_SECRET`.
3. In `backend`, run `npm install`, `npx prisma generate`, `npx prisma migrate dev --name init`, `npm run seed`, then `npm run dev`.
4. In `frontend`, run `npm install`, copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_API_URL=http://localhost:4000/api`, then `npm run dev`.
5. Open http://localhost:3000.

## Seed demo accounts

The seed script creates local demo accounts (only use these credentials in a local development database):

- Super Admin: `admin@appzex.test` / `Admin123!`
- Agency Admin: `owner@bright.test` / `Agency123!`
- Agency Team: `dev@bright.test` / `Agency123!`
- Client: `client@north.test` / `Client123!`
- Second agency owner: `owner@pixel.test` / `Agency123!`

## API overview

All routes are prefixed with `/api`. Authenticated endpoints expect `Authorization: Bearer <token>`.

| Area | Endpoint | Access |
|---|---|---|
| Health | `GET /health` | Public |
| Authentication | `POST /auth/login`, `GET /me` | Public / authenticated |
| Platform | `GET /admin/overview`, `GET /admin/agencies`, `POST /admin/agencies`, `GET /admin/agencies/:id`, `PATCH /admin/agencies/:id/status` | Super Admin |
| Workspace | `GET /dashboard`, `GET /projects`, `POST /projects` | Agency roles / client as scoped |
| Clients | `GET /clients`, `POST /clients` | Admin/team read; Admin create |
| Team | `GET /team`, `POST /team` | Admin/team read; Admin create |
| Tasks | `POST /projects/:id/tasks`, `PATCH /tasks/:id` | Agency Admin/Team |
| Project status | `PATCH /projects/:id/status` | Agency Admin/Team |
| Feedback | `GET /feedback`, `POST /projects/:id/feedback`, `PATCH /feedback/:id` | Tenant/client scoped |
| Meetings | `POST /projects/:id/meetings` | Agency Admin/Team |
| Activity | `GET /activities` | Tenant scoped; client-visible only for clients |
| AI | `POST /projects/:id/ai-update` | Agency Admin/Team |

## Security notes

- Operational records are associated with an agency; endpoints resolve agency scope from the verified JWT rather than trusting a client-supplied agency ID.
- Client project and feedback queries are scoped to the authenticated client's `clientId`.
- Agency Admin and Agency Team privileges are checked on write endpoints; Super Admin endpoints have a separate role guard.
- Passwords are stored as bcrypt hashes. Do not commit `.env` files, production credentials or API keys.
- Agency status is checked during login and on agency-protected requests.

## Current MVP limitations

This repository is a functional MVP foundation, not a fully audited production product. The current Prisma schema and UI do **not yet implement full milestones, secure file uploads/downloads, invitation emails, configurable fine-grained roles, or a complete support-mode workflow**. The meeting flow is create-focused, and the client feedback experience is limited. Before production, add schema migrations and UI for these modules, automated cross-tenant authorization tests, input schema validation, rate limiting, session revocation, secure object storage with permission-checked downloads, observability and deployment checks.

## Development workflow

Work on the `assignment-completion` branch for the additional team, activity and project-status changes. Review the diff and run backend build, frontend lint/build, migrations and manual role/tenant tests before merging or sharing a release. Never claim a feature is complete unless it has been implemented and verified.

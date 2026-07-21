# NovaNet production launch guide

## What is included

- Customer registration and login with bcrypt password hashes, rate limits, protected cookies, and role-based access.
- PostgreSQL schema for customers, plans, payments, subscriptions, invoices, and idempotent webhook events.
- Razorpay order creation, server-side checkout signature verification, and signed webhook validation.
- Automatic subscription renewal, PDF invoice creation, and optional email, WhatsApp, and MikroTik integration adapters.
- Docker configuration for a Node 20 + PostgreSQL deployment.

## Before publishing

1. Choose a managed host with private PostgreSQL and HTTPS, or use a VPS with Docker. This project includes Caddy, which issues and renews HTTPS certificates once DNS points `DOMAIN` to the VPS. Do not expose PostgreSQL publicly.
2. Point your domain DNS to the host and configure `APP_BASE_URL` with the exact `https://` address.
3. Copy `.env.production.example` to `.env` **only on the server**, set unique values, and do not commit it.
4. Run `npm run db:migrate` against the production database. For the included Docker stack, run `docker compose run --rm app npm run db:migrate`, then `docker compose up -d --build`.
5. Promote the first owner manually after registering: `UPDATE users SET role='admin' WHERE email='owner@example.com';`.
6. Add the Razorpay webhook: `https://your-domain.example/api/webhooks/razorpay`, subscribe to `payment.captured` and `order.paid`, and set the same webhook secret in the server environment.
7. Keep Razorpay in test mode until registration, checkout, webhook delivery, invoice, and renewal are all verified. Then rotate test variables to live values in your host's secret manager.

## Critical operating rules

- Never activate a plan from a browser callback alone; this service verifies the signed Razorpay response and also processes idempotent signed webhooks.
- Do not expose MikroTik RouterOS REST to the public internet. Use a VPN/private network, a restricted automation account, and map each approved customer to `router_secret_id` in `customer_profiles`.
- Set `MIKROTIK_ENABLED=false` until your network engineer confirms the RouterOS API endpoint and account permissions. Automated activation should be tested on a non-production router first.
- Configure SMTP and WhatsApp only after you have approved sender identities and notification templates.
- Back up PostgreSQL daily and store invoices in object storage for a multi-server deployment; local Docker volume storage is not sufficient for disaster recovery.

## What I still need before a real launch

- The exact public domain and the hosting platform you want to use.
- A hosted PostgreSQL connection string (entered only in your host secret manager).
- Razorpay **live** credentials, entered only in the host secret manager.
- ISP billing/provisioning API documentation or the router platform and approved activation method.
- Approved email sender and WhatsApp Business API account details.

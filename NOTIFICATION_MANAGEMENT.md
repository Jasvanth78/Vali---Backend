# Valikati notification management

The existing Firebase Cloud Messaging integration now dispatches through one database-backed service. Existing notification history, users, tokens, Blog data, poster data, advertisements, calendar data, and festival data are preserved.

## Existing sends migrated

- Daily 7:00 AM Rasi Palan reminder (`Asia/Kolkata`)
- Rasi-specific notification after Rasi Palan publication
- New Article publication notification
- New spiritual event notification
- Existing manual admin notification endpoint

The old on-device daily alarm and socket-created article notification are cancelled/disabled so they cannot bypass admin or user preferences. New video, poster, panchangam, and festival rules remain inactive until an admin creates a supported rule.

## Control order

Every dispatch rechecks global status, category status, individual definition status, automation/campaign status, audience eligibility, device permission, and device category preference immediately before each Firebase batch. A disabled item affects only its own level. Queued work is checked again before sending.

Ambiguous provider requests are recorded as `unknown` and are not automatically replayed. `accepted` means accepted by FCM and does not guarantee delivery. Device tokens and credentials are never returned by admin or public APIs.

## APIs

Admin routes under `/api/admin/notifications` require the existing admin JWT:

- `GET /dashboard`, `PUT /global`, `POST /estimate`, `GET /recipients`
- CRUD and status routes for `/categories`, `/definitions`, `/rules`, `/templates`, `/segments`, and `/campaigns`
- `POST /campaigns/:id/send`, `POST /campaigns/:id/test`
- `GET /logs`, `GET /logs/:id/attempts`, `GET /legacy-history`
- `POST /templates/preview`, `POST /upload`

Device routes under `/api/notifications` use an installation ID and random installation secret:

- `POST /devices`
- `GET|PUT /preferences`
- `POST /opened/:notificationId`

The compatibility route `POST /api/admin/send-notification` is now protected by admin authentication and uses the same dispatcher.

## Storage

Migration: `npm run db:notifications` is implemented by `scripts/migrate-notifications.js`. It is idempotent and seeds only the five notification types and four rules that already existed in the application. Collections use the `notification_` prefix and preserve the original `Notification` inbox collection.

## Operational notes

- Notification images must be HTTPS URLs. Relative `/uploads/...` images require `PUBLIC_API_URL` so FCM can fetch them.
- Admin-created event rules are limited to trigger integrations registered in backend code. Adding text, templates, categories, audiences, schedules, and existing destinations requires no APK release; adding a brand-new backend event or Flutter destination does.
- Recurrence supports one-time, daily, weekly, and monthly schedules with IANA time zones.
- The app refreshes device permission and registration on startup, token refresh, and resume. Category preferences live in Flutter Settings, and notification taps safely validate destination parameters.

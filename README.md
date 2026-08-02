# Appointment Booking Web Application & Reminder Service

A fast, highly aesthetic, and reliable appointment booking system built with **Next.js 15/16 (App Router)**, **Tailwind CSS**, **Supabase Postgres**, and **Resend**. It includes an automated cron email reminder script designed for standalone deployment on **Railway**.

---

## Repository Structure

- `/src` - Core Next.js public client page, admin console, server actions, and db connection pool.
- `/reminder-service` - Standalone Node.js **cron script** that queries upcoming appointments and sends reminders via Email (Resend/SMTP), SMS (Fast2SMS), and WhatsApp. Runs as a Railway Cron trigger every 15 minutes.
- `/whatsapp-service` - Separate **always-on Node.js service** that maintains the persistent Baileys/WhatsApp connection and exposes a `POST /send` HTTP endpoint for the reminder script to call.
- `schema.sql` - Database schema script containing the required table definitions, foreign keys, and indexes.

---

## Environment Variables Configuration

Both the Next.js main application (Vercel) and the reminder script (Railway) require the following environment variables:

| Variable Name | Required By | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Both | Supabase Postgres Transaction Pooler connection string | `postgres://postgres.xxxx:[Password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `RESEND_API_KEY` | reminder-service | API Key from Resend.com for email sending | `re_1234567890abcdef` |
| `ADMIN_PASSWORD` | Next.js app | Plaintext password to access the admin console | `MySecureAdminPass123` |
| `REMINDER_HOURS_BEFORE` | reminder-service | Lead time window (in hours) to trigger reminders | `24` |
| `NEXT_PUBLIC_BUSINESS_NAME` | Both | Business name displayed on pages and notifications | `Aura Wellness` |
| `NEXT_PUBLIC_BUSINESS_LOCATION` | Next.js app | Location shown in confirmation emails | `123 Wellness Way, Cityville` |
| `RESEND_FROM_EMAIL` | reminder-service | Sender email address | `onboarding@resend.dev` |
| `SMTP_USER` | reminder-service | Gmail address (optional SMTP fallback) | `you@gmail.com` |
| `SMTP_PASS` | reminder-service | Gmail App Password (16-char, no spaces) | `xxxx xxxx xxxx xxxx` |
| `FAST2SMS_API_KEY` | reminder-service | API key from fast2sms.com dashboard | `xxxxxxxx...` |
| `SMS_ENABLED` | reminder-service | Set `true` to enable SMS reminders | `false` |
| `WHATSAPP_ENABLED` | Both services | Set `true` to enable WhatsApp reminders (feature flag) | `false` |
| `WHATSAPP_SERVICE_URL` | reminder-service | URL of the always-on whatsapp-service | `http://localhost:3001` |
| `WHATSAPP_DAILY_SEND_LIMIT` | whatsapp-service | Max WhatsApp messages per calendar day | `200` |
| `WHATSAPP_PORT` | whatsapp-service | Port the whatsapp-service HTTP server binds to | `3001` |

> [!NOTE]
> Supabase provides two connection strings: Session (port 5432) and Transaction Pooler (port 6543). For serverless environments like Vercel and Railway, always use the **Transaction Pooler string (port 6543)** to avoid database connection exhaustion.

---

## Local Setup & Development

### 1. Database Initialization
1. Log in to your [Supabase Dashboard](https://supabase.com).
2. Go to the **SQL Editor** tab of your project.
3. Open a new query window, copy the contents of [schema.sql](file:///c:/Users/sonib/Desktop/appointment/schema.sql), and click **Run**.
4. This creates:
   - `time_slots`: Stores administrative time slots.
   - `appointments`: Stores bookings, referencing the unique slots.
   - `unique_active_appointment_slot` (Unique Partial Index): Guarantees at the database level that no two active appointments can double-book the same slot.
   - Sample seeds for tomorrow and the day after tomorrow.

### 2. Configure Local Environment
Create a `.env` file in the root directory:
```env
DATABASE_URL="YOUR_SUPABASE_POOLER_URL"
RESEND_API_KEY="YOUR_RESEND_API_KEY"
ADMIN_PASSWORD="admin"
REMINDER_HOURS_BEFORE=24
NEXT_PUBLIC_BUSINESS_NAME="Aura Wellness"
NEXT_PUBLIC_BUSINESS_LOCATION="123 Wellness Way, Cityville"
RESEND_FROM_EMAIL="onboarding@resend.dev"
```

### 3. Run the Next.js Frontend
From the root folder, run:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to see the booking app.
Access the admin portal at [http://localhost:3000/admin](http://localhost:3000/admin) (Password: `admin` or as configured).

### 4. Run the Reminder Script Locally
You can test the standalone Railway reminder script locally from the root folder:
```bash
cd reminder-service
npm install
node index.js
```
The script will check for slots starting within the next `24` hours, send emails if needed, update the database row `reminder_sent = true`, and cleanly close the connection.

---

## ⚠️ WhatsApp Integration — Unofficial Library & Ban Risk

> [!CAUTION]
> **This integration uses [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial reverse-engineered WhatsApp library. It is NOT the Meta WhatsApp Business API.**
>
> **Known risks:**
> - Meta (WhatsApp) actively detects automation libraries and **can permanently ban the linked phone number without warning or appeal**.
> - The session may be invalidated at any time, requiring a new QR scan.
> - WhatsApp's Terms of Service prohibit automated messaging via unofficial clients.
>
> **Why this approach was chosen:** The official Meta WhatsApp Business API requires 5+ business days for verification, which conflicts with the project deadline. This is explicitly a time-boxed trade-off. Once verification is complete, migrating to the official API is the recommended upgrade path.
>
> **How to mitigate risk:**
> - Keep `WHATSAPP_ENABLED=false` until you are ready to use it.
> - Use the `WHATSAPP_DAILY_SEND_LIMIT` cap to avoid high-volume sends.
> - Do not send identical messages repeatedly — the service adds random delays between sends.
> - Turn off instantly by setting `WHATSAPP_ENABLED=false` (no redeployment needed).
> - **Never use the business's primary/critical phone number** — use a secondary number if possible.

---

## Deployment Guide

### Part 1: Deploying Main Next.js App to Vercel
1. Push your repository to GitHub (include all folders except `.env` and `node_modules`).
2. Log in to [Vercel](https://vercel.com) and click **Add New** > **Project**.
3. Import your GitHub repository.
4. Expand **Environment Variables** and add all the keys listed in the table above.
5. Click **Deploy**. Vercel will automatically compile, optimize, and launch your application.

### Part 2: Deploying Reminder Cron Script to Railway
1. Log in to [Railway](https://railway.com) and create a new project.
2. Select **Deploy from GitHub repo** and point it to the same repository.
3. By default, Railway might try to deploy the root Next.js project. We need to tell it to build only the `reminder-service` sub-folder:
   - Under the service **Settings** > **General** > **Root Directory**, set it to `reminder-service`.
4. Add the following environment variables under the **Variables** tab:
   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - `REMINDER_HOURS_BEFORE`
   - `NEXT_PUBLIC_BUSINESS_NAME`
   - `RESEND_FROM_EMAIL`
5. Add the additional SMS/WhatsApp env vars under the **Variables** tab (set both to `false` initially):
   - `SMS_ENABLED=false`
   - `FAST2SMS_API_KEY` (add when ready)
   - `WHATSAPP_ENABLED=false`
   - `WHATSAPP_SERVICE_URL` (Railway internal URL of the whatsapp-service, once deployed)
   - `WHATSAPP_DAILY_SEND_LIMIT=200`
6. Configure the native cron trigger in Railway:
   - Under service **Settings** > **Deploy** > **Cron Schedule**, configure a cron frequency like:
     `*/15 * * * *` (runs every 15 minutes).
7. Redeploy the service. Railway will now execute `npm start` (which runs `node index.js`) every 15 minutes, send out pending emails (+ SMS/WhatsApp if enabled), update the DB status, and exit.

### Part 3: Deploying WhatsApp Service to Railway (Optional)

The `whatsapp-service` must run as an **always-on** process (not a cron job) because Baileys requires a persistent WebSocket connection to WhatsApp's servers.

1. In Railway, **add a new service** within the same project.
2. Point it to the same GitHub repository.
3. Under **Settings** > **General** > **Root Directory**, set it to `whatsapp-service`.
4. Add environment variables:
   - `WHATSAPP_ENABLED=false` (start disabled until QR is scanned)
   - `WHATSAPP_DAILY_SEND_LIMIT=200`
   - `WHATSAPP_PORT=3001`
5. **Do NOT set a Cron Schedule** — leave it as an always-running service.
6. Deploy the service. Once running, open the **Railway Logs** for this service.
7. **One-time QR scan:**
   - Temporarily set `WHATSAPP_ENABLED=true` and redeploy.
   - A QR code will appear in the Railway logs within ~10 seconds.
   - Open WhatsApp on the business phone → **Linked Devices** → **Link a Device** → scan the QR.
   - The session is saved to `auth_info_baileys/` and will persist across restarts.
   - You will see `[WhatsApp] ✓ Connected and ready to send messages.` in the logs.
8. **Persist the session across Railway redeployments:**
   - Railway's filesystem is ephemeral — `auth_info_baileys/` is lost on each deploy.
   - To persist it, add a **Railway Volume** mounted at `/app/auth_info_baileys`.
   - Go to service **Settings** > **Volumes** > **Add Volume** → mount path: `/app/auth_info_baileys`.
9. Update `WHATSAPP_SERVICE_URL` in the **reminder-service** Variables to the Railway internal URL of this service (e.g. `http://appointment-whatsapp-service.railway.internal:3001`).

### Part 4: Setting Up SMS via Fast2SMS

1. Create an account at [fast2sms.com](https://www.fast2sms.com).
2. Go to **Dev API** → copy your **API Key**.
3. Add `FAST2SMS_API_KEY` to the reminder-service Variables in Railway.
4. Set `SMS_ENABLED=true`.
5. Redeploy the reminder-service. SMS will be sent to any customer whose `customer_phone` field is a valid 10-digit Indian mobile number.

---

## Key Features Under the Hood
- **Multi-Channel Notifications**: Each reminder fires Email (always) → SMS (if `SMS_ENABLED=true` and phone present) → WhatsApp (if `WHATSAPP_ENABLED=true` and socket connected). Each channel is fully independent — one failure never blocks another.
- **Double Booking Prevention**: Handled at the database level with a unique partial index on `appointments(slot_time) WHERE status IN ('booked', 'completed', 'no-show')`. Even if two users submit the booking form at the exact same millisecond, the database transaction will fail for the second attempt, which is cleanly handled by our server action.
- **Next.js 16 Proxy Protection**: Simple, highly efficient page routing checks are performed within `/src/proxy.ts` (formerly Middleware) to block unauthorized visitors.
- **Client Cache Revalidation**: Any scheduling, manual booking, or booking deletion immediately triggers Next.js path revalidations (`revalidatePath`) to ensure slot selections reflect immediately across all active screens.
- **WhatsApp Safety Guards**: Daily send cap (`WHATSAPP_DAILY_SEND_LIMIT`), random per-message delay (1.5–3 seconds), and auto-reconnect with exponential backoff (3 attempts). The `WHATSAPP_ENABLED` flag can be toggled without redeployment.

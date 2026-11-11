# iPhone: bank SMS → FinWise, plus push notifications

How it works:

```
Bank SMS ─► iPhone Shortcut automation ─► POST /api/sms ─► skip OTP/promo/credit/failed
                                                         └► AI parse ─► SMS Inbox (pending) ─► push "📩 Log ₹500?"
                                                                                               tap ─► /pending ─► Log it / Dismiss
Supabase pg_cron 9 PM IST ─► POST /api/notify/daily ─► daily summary, bills due tomorrow, monthly recap, budget alerts
Any new expense ─► budget alert at 50 / 80 / 100% (once per budget per month)
```

Do the four parts in order: **A** server, **B** Supabase, **C** iPhone app and notifications, **D** Shortcut.

---

## A. Server environment variables (one time)

1. On your Mac, inside this repo:
   ```bash
   npx web-push generate-vapid-keys
   ```
   This prints a **Public Key** and a **Private Key**.
2. Make two random secrets:
   ```bash
   openssl rand -hex 32
   ```
   Run it twice. Call the first `SMS_INGEST_TOKEN` and the second `CRON_SECRET`.
3. In your host's environment variables (Vercel: Project → Settings → Environment Variables → Production), add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public Key from step 1 |
   | `VAPID_PRIVATE_KEY` | Private Key from step 1 |
   | `VAPID_SUBJECT` | your app URL, e.g. `https://finwise-ai.vercel.app` |
   | `SMS_INGEST_TOKEN` | first secret |
   | `CRON_SECRET` | second secret |
   | `SMS_REDACT_NAMES` | optional: names to hide from the AI, comma-separated, e.g. `Rahul,Pandey` |

   **Privacy:** the AI (GPT-5.6 Luna) only sees a masked copy of each SMS: OTPs, balances/limits, card and account digits, phone numbers, emails, reference numbers, "Dear <name>" and the names above are replaced with `[OTP]`, `[BALANCE]`, `XXXX` and so on. Payment method names are sent without their digits. The original SMS is stored only in your own database, for the SMS Inbox.

4. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time, so a fresh build is required.

## B. Supabase (one time)

1. Open `supabase/notifications.sql`. In the cron block at the bottom, replace:
   - `YOUR-APP-DOMAIN` with your deployed domain (for example `finwise.vercel.app`)
   - `YOUR_CRON_SECRET` with the `CRON_SECRET` from A.2
2. Supabase dashboard → **SQL Editor** → New query → paste the whole file → **Run**.
   This creates the tables, locks them from the public key, and schedules the 9 PM IST job (`30 15 * * *` UTC).
3. Check it's scheduled: run `select jobname, schedule from cron.job;` and you should see `finwise-daily-9pm`.

## C. iPhone: install the app and turn on notifications

Web Push on iPhone only works for the **Home Screen app** (iOS 16.4 or later), not a Safari tab.

1. Open **Safari** and go to your app URL. Log in.
2. Tap **Share** (the square with an up arrow) → **Add to Home Screen** → **Add**.
3. Close Safari. Open **FinWise AI from the Home Screen icon**. Log in again; the Home Screen app keeps its own storage.
4. Tap your avatar (top right) → **Enable Notifications** → **Allow**.
5. Within a few seconds you should get **"✅ FinWise notifications are on"**. If not, see Troubleshooting.

## D. iPhone Shortcut: forward bank SMS

You build **one shortcut** that sends text to the app, then **one automation per keyword** that runs it.

### D1. The shortcut "Log Bank SMS"

1. Open the **Shortcuts** app → **Shortcuts** tab (bottom) → **+** (top right).
2. Tap the name at the top → **Rename** → type `Log Bank SMS` → Done.
3. Tap **Search Actions** (bottom), type `Get Contents of URL`, and tap it.
4. Tap the blue **URL** and type `https://YOUR-APP-DOMAIN/api/sms`.
5. Tap the **›** arrow on the action to expand it.
6. **Method**: tap **GET** → choose **POST**.
7. **Headers**: tap **Add new header**.
   - Key: `Authorization`
   - Value: `Bearer ` then paste your `SMS_INGEST_TOKEN` (one space after `Bearer`)
8. **Request Body**: make sure it says **JSON**. Tap **Add new field** → **Text**.
   - Key: `text`
   - Value: tap the value box, then tap **Shortcut Input** in the bar above the keyboard.
9. Tap **Done** (top right).

### D2. The automations (one per keyword)

Repeat this for each keyword: **`debited`**, **`spent`**, **`Sent Rs`**, **`withdrawn`**.

1. Shortcuts app → **Automation** tab (bottom) → **+** (top right). The first time, it's **New Automation**.
2. Scroll down and tap **Message**.
3. Tap **Message Contains**, type the keyword (for example `debited`), and tap **Done**. Leave **Sender** as is.
4. Select **Run Immediately**. Turn **Notify When Run** off. Tap **Next**.
5. Tap **New Blank Automation**.
6. Tap **Search Actions**, type `Run Shortcut`, and tap it.
7. Tap **Shortcut** inside the action → choose **Log Bank SMS**.
8. Tap the **›** arrow on the action → **Input** → choose **Shortcut Input**. Then tap the blue **Shortcut Input** token → choose **Content**, so only the SMS text is sent.
9. Tap **Done**.

**Why several automations:** iOS allows only one "contains" word per automation, and banks word their SMS differently. Look at a few of your own bank SMS and add a keyword automation for any wording these four miss. A message that triggers two automations is only logged once, because the server ignores duplicates.

**Privacy:** any message containing a keyword (even from a friend) is sent to **your own** server, nowhere else. The server ignores anything that isn't a completed debit.

### D3. Test it

- **Server only, from your Mac** (replace the domain and token):
  ```bash
  curl -X POST https://YOUR-APP-DOMAIN/api/sms -H "Authorization: Bearer YOUR_SMS_INGEST_TOKEN" -H "Content-Type: application/json" -d '{"text":"Rs.1.00 debited from A/c XX1234 on 11-11-26 to VPA test@upi (UPI Ref No 431234567890)."}'
  ```
  Expected: `{"status":"pending",...}` and a **"📩 Log ₹1?"** notification on your phone.
  Open the app → **SMS Inbox** → **Dismiss** it.
- **End to end:** pay ₹1 by UPI to anyone. The bank SMS should produce the same notification within a few seconds.
- **9 PM summary, without waiting for 9 PM:**
  ```bash
  curl -X POST https://YOUR-APP-DOMAIN/api/notify/daily -H "Authorization: Bearer YOUR_CRON_SECRET"
  ```

---

## What you'll get

| Notification | When | Tap opens |
|---|---|---|
| 📩 **Log ₹500?** (merchant, payment method, category) | A bank debit SMS arrives | SMS Inbox |
| ⚠️ **Food budget at 82%** / 🚨 **exceeded** | An expense pushes a budget past 50%, 80% or 100% (once per threshold per month) | Dashboard |
| 🌙 **Today: ₹1,240 spent** (top categories, month-to-date, daily average, SMS waiting for review) | Every day at 9 PM IST | Transactions, or SMS Inbox if any are waiting |
| 📅 **Due tomorrow: ₹25,649** (Rent, Netflix …) | 9 PM, the day before a recurring expense | Recurring |
| 📊 **October recap** (spent, earned, saved %) | 9 PM on the 1st of each month | Reports |

## How accuracy is handled

- **Only completed debits are kept.** OTPs, "will be debited", bills due, declined or failed payments, refunds, credits, loan offers and payment requests are dropped before any AI call (`src/lib/sms.ts`, tested in `src/lib/sms.test.ts`).
- **The amount comes from the SMS text, not the AI.** Balance and limit figures are ignored.
- **The AI fills in the rest:** merchant, category, payment method and need/want.
- **Payment methods are learned.** When you confirm, the card or account digits (for example `XX1234`) are remembered against the payment method you chose. The next SMS from that card fills it in automatically.
- **The date** is the day the SMS arrived. A date read from the SMS is used only if it's within the last 3 days.
- **Nothing reaches your totals until you tap Log it.**

## Troubleshooting

- **"Push not available here":** you're in a Safari tab. Open the app from the Home Screen icon.
- **No test notification:**
  - iPhone Settings → Notifications → FinWise AI → Allow Notifications.
  - Check that the VAPID variables are set and that you redeployed after adding them.
- **Shortcut never fires:**
  - Shortcuts → Automation → open the automation and confirm **Run Immediately** is selected.
  - Confirm the keyword actually appears in your bank's SMS.
- **Got `401` from curl:** the token doesn't match the environment variable. The header must be exactly `Bearer <token>`.
- **No 9 PM notification:** in Supabase, run `select * from cron.job_run_details order by start_time desc limit 5;` and check the URL and secret in the cron block.

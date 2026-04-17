# EnQaZ Hardware API - Practical Integration Guide

This is a comprehensive, step-by-step guide for the embedded hardware team to successfully integrate with the EnQaZ backend. It is designed to be error-proof and focused on testing and debugging.

---

## 🚀 Quick Start (Works Immediately)

You can copy and paste the following `curl` commands into your terminal to test connectivity instantly. 

*(Note for Windows users: Ensure the command is exactly on one line without `^` line breaks, as Windows CMD handles multiline escaping poorly.)*

### A. Send Crash Alert (Working Curl)
```bash
curl -X POST "https://pjyoqvxkflaxayxbmpmy.supabase.co/rest/v1/hardware_requests" -H "apikey: sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp" -H "Authorization: Bearer sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"device_id\": 1, \"request_type\": \"alert\", \"lat\": 30.123456, \"lng\": 31.654321, \"raw_payload\": \"{\\\"speed\\\": 85, \\\"g_force\\\": 4.7, \\\"crash_detected\\\": true}\"}"
```

### B. Send Cancel Alert (Working Curl)
```bash
curl -X POST "https://pjyoqvxkflaxayxbmpmy.supabase.co/rest/v1/hardware_requests" -H "apikey: sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp" -H "Authorization: Bearer sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"device_id\": 1, \"request_type\": \"cancel\", \"raw_payload\": \"{\\\"reason\\\": \\\"false alarm\\\"}\"}"
```

---

## 🛠️ Postman Guide (How to use correctly)

If you are testing via Postman, follow these exact steps to avoid `400 Bad Request` errors from the Cloudflare/Supabase firewall.

1. **Method**: `POST`
2. **URL**: `https://pjyoqvxkflaxayxbmpmy.supabase.co/rest/v1/hardware_requests`
3. **Headers Tab**: Add the following explicitly:
   - `apikey`: `sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp`
   - `Authorization`: `Bearer sb_publishable_29IFggrPeRHvFxFDYTKVkA_wqsy9nEp`
   - `Content-Type`: `application/json`
   - `Prefer`: `return=representation`
4. **Body Tab** (CRITICAL):
   - You MUST select **raw** and then pick **JSON** from the dropdown. 
   - ❌ **Do NOT use** `form-data`
   - ❌ **Do NOT use** `x-www-form-urlencoded`
   - ❌ **Do NOT use** `text`
   - ❌ **Do NOT forget** `Bearer ` in the Authorization token

### Postman Body (Copy-Paste Ready)
```json
{
  "device_id": 1,
  "request_type": "alert",
  "lat": 30.123456,
  "lng": 31.654321,
  "raw_payload": "{\"speed\": 85, \"g_force\": 4.7, \"crash_detected\": true}"
}
```

---

## 🚦 System Architecture (Simplified)

Your hardware only talks to **ONE** place: the `hardware_requests` API. 
**Hardware → API `hardware_requests` → System Watchdog (10s) → Dispatch**

1. **Alert Sent**: Hardware sends alert to `hardware_requests`.
2. **Watchdog Starts**: Engine detects it and starts a 10s timer.
3. **Cancel or Proceed**: If you send a `"cancel"` request within 10s, it aborts. If not, the system creates a full emergency incident.
4. **Rule**: Hardware **NEVER** creates incidents directly.

---

## 📊 Endpoints & Request Types

There is **ONLY ONE** endpoint for hardware: `POST /hardware_requests`

| Type | Required Fields | Description |
| :--- | :--- | :--- |
| **`alert`** | `device_id`, `lat`, `lng`, `raw_payload` | Sends a crash notification. Starts 10s watchdog. |
| **`cancel`**| `device_id`, `raw_payload` | Aborts a previously sent crash notification. |

---

## ⚠️ The `device_id` Trap (CRITICAL)

> [!WARNING]
> This is the most common integration mistake. 
> The `device_id` field expects the numerical internal database `id` (e.g., `1`), **NOT** the alphanumeric `device_uid` (e.g., `DEV-49F1`).

Ensure you query/store the `id` from the `devices` table for your operations. If you pass an invalid or string-based ID, the database will return a **500 Foreign Key Error**.

---

## ⚠️ The `raw_payload` Trap (Simplified)

> [!IMPORTANT]
> `raw_payload` is a **STRING** inside your JSON body. 

It is NOT a nested JSON object. The database expects `raw_payload` to be escaped stringified JSON.

**✅ Correct (Stringified JSON)**:
```json
"{\"speed\": 85}"
```

**❌ Wrong (Nested Object)**:
```json
{
  "speed": 85
}
```

---

## 🔥 Common Errors & Fixes
The absolute most critical section for debugging real-world problems.

### A) 400 Bad Request (Cloudflare/Supabase Block)
* **Cause**: Usually malformed JSON syntax, wrong `Content-Type`, or a bad `Authorization` header.
* **Fix**: 
  - Ensure Postman body is set to `raw -> JSON`.
  - Fix your `Bearer ` prefix format.
  - Rewrite the body manually instead of pasting from a rich text editor which places hidden bad characters.

### B) No Response or Empty Body from curl
* **Cause**: Missing the `Prefer: return=representation` header. Supabase inserts by default do not return the created row unless explicitly requested.
* **Fix**: Add `-H "Prefer: return=representation"` to your request.

### C) 500 Internal Server Error (Foreign Key Violation)
* **Cause**: Sending a `device_id` that does not exist in the `devices` table.
* **Explain**: `device_id` (like `1`) belongs to the `devices.id` table, you probably mistakenly used the `device_uid` (like `1202022929`).
* **Fix**: Ensure you are using the mapped numeric `id`.

### D) `raw_payload` Error (Parse Error or Object Invalid)
* **Cause**: Sending a raw JSON object instead of a stringified object.
* **Fix**: Change it into a string as seen in the `raw_payload` trap documentation.

---

## 🩺 Debug Flow

If your request fails, follow this order specifically to fix the issue:

1. **Check Authorization Bearer**: Ensure `apikey` and `Authorization` headers are exact. Did you include `Bearer `?
2. **Check JSON format**: Run your JSON body on [JSONLint](https://jsonlint.com/) to find syntax errors. Verify `raw_payload` is just one big string.
3. **Check `device_id`**: Are you sure `device_id: 1` actually exists in your remote database right now? Check the DB.
4. **Try curl instead of Postman**: Postman can append hidden whitespaces. Fire the **Working Curl** from the Quick Start inside your terminal.

---

## 🛠 Validation & Data Sources (Quick Reference)

* `lat`: Must be between `-90` and `90`. Must come from a real physical GPS sensor.
* `lng`: Must be between `-180` and `180`. Must come from a real physical GPS sensor.
* `speed`: Must be numeric (from CAN bus or GPS speed data).
* `g_force`: Must be numeric (from the onboard hardware accelerometer).
* `crash_detected`: Must explicitly equal `true` inside the `raw_payload` string during an alert.

---

## ✅ DO & DON'T Reference
**DO**
* Send an alert immediately upon crash detection.
* Send a cancel within **10 seconds** if the detector generated a false positive.

**DO NOT**
* Attempt to modify the `incidents` table.
* Retry blindly without a backoff timer if the server gives a 500 status.
* Send malformed or incomplete data payloads.

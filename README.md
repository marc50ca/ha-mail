# Email Inbox — Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2023.1%2B-blue)](https://www.home-assistant.io/)

Display **Gmail** and **Microsoft 365 / Outlook** emails directly in Home Assistant. Includes a full-width custom Lovelace card with a horizontal unread-mail strip, popup message reader, delete, and mark-as-read — without ever storing your password.

---

## Features

- 📬 **Unread count sensor** — live badge of unread email count
- 📋 **Inbox sensor** — latest subject as state; full email list as attributes (subject, sender, date, snippet, read/unread, message ID)
- 🗑️ **Delete emails** — moves to Trash (Gmail) or Deleted Items (Microsoft 365)
- ✅ **Mark as read** — clears the unread flag
- 🃏 **Custom Lovelace card** — full-width horizontal unread strip, per-tile actions, full popup message reader
- 🔄 **Auto-refresh** every 5 minutes with manual refresh button
- 🔒 **OAuth2** — tokens stored securely and auto-refreshed; no password ever saved
- ⚙️ **Config Flow UI** — set up entirely from Settings → Integrations, no YAML required
- 🔁 **Options flow** — change folders, labels or email count without re-authenticating

---

## Requirements

- Home Assistant **2023.1** or newer
- Your HA instance must be accessible at a **public HTTPS URL** — this is required for the OAuth2 redirect to work. Your URL is: `https://homeassistant.peterborough.madasc.com:8123`
- A free **Google Cloud** account (Gmail) or **Microsoft Azure** account (Microsoft 365) to register an OAuth2 app

---

## Installation Overview

There are three stages to get everything working:

1. **Register an OAuth2 app** with Google or Microsoft (one-time)
2. **Install the integration** into Home Assistant via HACS or manually
3. **Install the Lovelace card** resource and add it to a dashboard

All three stages are covered step by step below.

---

## Stage 1 — Register Your OAuth2 App

Both providers require you to register a redirect URI in their developer portal **before** you begin the HA setup wizard. The redirect URI for your instance is:

```
https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
```

> ⚠️ This path must be registered **exactly** as shown — correct protocol (`https://`), correct port (`:8123`), and the exact path. No trailing slash. Any mismatch will produce a "redirect_uri mismatch" error.

---

### Gmail — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in with your Google account.

2. Create a new project (or select an existing one) using the project dropdown at the top of the page.

3. **Enable the Gmail API:**
   - Left menu → **APIs & Services → Library**
   - Search for **Gmail API** → click it → click **Enable**

4. **Configure the OAuth consent screen:**
   - Left menu → **APIs & Services → OAuth consent screen**
   - User type: choose **External** (unless you are using Google Workspace, in which case choose Internal)
   - Fill in **App name** (e.g. "Home Assistant") and **User support email**
   - Under **Scopes** → click **Add or remove scopes** → paste this scope and click Add:
     ```
     https://www.googleapis.com/auth/gmail.modify
     ```
     > This scope allows reading, trashing, and marking emails as read. Using `gmail.readonly` instead will cause a 403 error on delete and mark-read operations.
   - Under **Test users** → click **Add users** → add your Gmail address
   - Save and continue through the remaining screens

5. **Create OAuth2 credentials:**
   - Left menu → **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application** (not Desktop — Google deprecated the desktop out-of-band flow)
   - Name: anything, e.g. "Home Assistant Email"
   - Under **Authorised redirect URIs** → **Add URI** → paste:
     ```
     https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
     ```
   - Click **Create**

6. A dialog shows your **Client ID** and **Client Secret** — copy both. You can also find them later under APIs & Services → Credentials → your client.

---

### Microsoft 365 / Outlook — Azure Portal

1. Go to [portal.azure.com](https://portal.azure.com/) and sign in with your Microsoft account.

2. **Register a new application:**
   - Search for **App registrations** in the top search bar → click it → **+ New registration**
   - Name: anything, e.g. "Home Assistant Email"
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox)**
   - Redirect URI: set the dropdown to **Web**, then paste:
     ```
     https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
     ```
   - Click **Register**

3. **Add API permissions:**
   - In your new app, go to **API permissions** → **+ Add a permission**
   - Choose **Microsoft Graph** → **Delegated permissions**
   - Search for `Mail.ReadWrite` → tick the checkbox → click **Add permissions**
     > `Mail.ReadWrite` is required for reading, deleting, and marking emails as read. Using `Mail.Read` alone will cause a 403 Forbidden error on any write operation.
   - Back on the API permissions page, click **Grant admin consent for [your tenant]** → Yes
     > This step is required even for personal Microsoft accounts. Without it, write operations will be rejected.

4. **Create a client secret:**
   - Go to **Certificates & secrets** → **+ New client secret**
   - Description: anything; Expires: choose your preferred duration
   - Click **Add**
   - **Immediately copy the Value** shown in the table — this is your Client Secret. It is only displayed once and cannot be retrieved again.

5. **Get your Client ID:**
   - Go to **Overview**
   - Copy the **Application (client) ID** — this is your Client ID

---

## Stage 2 — Install the Integration

### Option A — HACS (recommended)

HACS must be installed in your Home Assistant instance. If you haven't installed it yet, follow the [HACS installation guide](https://hacs.xyz/docs/setup/prerequisites).

1. In Home Assistant, go to **HACS** in the left sidebar
2. Click **Integrations** → click the **⋮** (three dots) menu in the top right → **Custom repositories**
3. In the dialog:
   - Repository URL: `https://github.com/yourusername/ha-email-inbox`
   - Category: **Integration**
   - Click **Add**
4. Close the dialog, then search for **Email Inbox** in the HACS integrations list
5. Click **Email Inbox** → **Download** → confirm the version → **Download**
6. **Restart Home Assistant:** Settings → System → **Restart** → Restart Home Assistant

### Option B — Manual installation

1. Download the latest release ZIP from the [Releases page](https://github.com/yourusername/ha-email-inbox/releases)
2. Unzip it — you will see a `custom_components/email_inbox/` folder
3. Copy the entire `email_inbox` folder into your HA config directory:
   ```
   /config/custom_components/email_inbox/
   ```
   The final structure should look like:
   ```
   /config/
   └── custom_components/
       └── email_inbox/
           ├── __init__.py
           ├── manifest.json
           ├── config_flow.py
           ├── sensor.py
           ├── gmail_client.py
           ├── microsoft_client.py
           ├── oauth_callback_view.py
           ├── api_view.py
           ├── const.py
           ├── services.yaml
           ├── strings.json
           ├── translations/
           │   └── en.json
           └── www/
               └── email-inbox-card.js
   ```
4. **Restart Home Assistant:** Settings → System → **Restart** → Restart Home Assistant

---

## Stage 3 — Set Up the Integration in Home Assistant

After restarting:

1. Go to **Settings → Integrations**
2. Click **+ Add Integration** (bottom right)
3. Search for **Email Inbox** and click it
4. **Step 1 — Choose provider:** select Gmail or Microsoft 365 and click Submit
5. **Step 2 — Enter credentials:** the form shows the redirect URI at the top for reference; enter your **Client ID** and **Client Secret** from Stage 1, then click Submit
6. **Step 3 — Authorize:** click the blue authorization link shown on screen
   - Your browser opens the Google or Microsoft sign-in page
   - Sign in and click **Allow** / **Accept**
   - Your browser redirects to your HA instance and shows a green **"Authorization successful"** page
   - Return to the HA tab and click **Submit**
7. **Step 4 — Settings:** configure which folders or labels to monitor and the maximum number of emails to fetch (1–50), then click Submit

The integration is now active. Two sensors are created per account (see Sensors Reference below) and the delete/mark-read services are registered.

---

## Stage 4 — Install the Lovelace Card

The card file ships inside the integration at:
```
/config/custom_components/email_inbox/www/email-inbox-card.js
```

### Step 1 — Copy the card file to your www folder

The card must be in `/config/www/` to be served by HA's built-in HTTP server.

**Using the File editor add-on (easiest):**
- Open the File editor add-on
- Navigate to `/config/custom_components/email_inbox/www/`
- Download or copy `email-inbox-card.js`
- Navigate to `/config/www/` (create the `www` folder if it doesn't exist)
- Paste or upload the file there

**Using SSH / terminal:**
```bash
mkdir -p /config/www
cp /config/custom_components/email_inbox/www/email-inbox-card.js /config/www/
```

**Using Samba / network share:**
Copy `email-inbox-card.js` from `config/custom_components/email_inbox/www/` to `config/www/`.

### Step 2 — Register the card as a Lovelace resource

1. Go to **Settings → Dashboards**
2. Click the **⋮** (three dots) menu in the top right → **Resources**
   > If you don't see Resources, enable **Advanced mode** first: click your username (bottom left) → toggle **Advanced mode** on
3. Click **+ Add resource**
4. Fill in:

   | Field | Value |
   |-------|-------|
   | URL | `/local/email-inbox-card.js` |
   | Resource type | **JavaScript module** |

5. Click **Create**
6. **Hard-refresh your browser:** press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac), or clear your browser cache. This is essential — without it the old (or absent) version of the card remains cached.

### Step 3 — Find your Config Entry ID

The card requires your integration's Entry ID to call the delete and mark-read services.

1. Go to **Settings → Integrations**
2. Find **Email Inbox** and click on your account entry
3. Click the **⋮** (three dots) menu → **System information**
4. Copy the value shown as **Entry ID** — it looks like `abc1234def5678`

### Step 4 — Add the card to a dashboard

1. Open any dashboard → click the **pencil icon** (Edit) → **+ Add card**
2. Scroll to the bottom of the card list and click **Manual**
3. Replace the template content with:

```yaml
type: custom:email-inbox-card
entity: sensor.gmail_inbox
entry_id: PASTE_YOUR_ENTRY_ID_HERE
title: Unread Emails
```

4. Click **Save**

The card will span the full width of your dashboard automatically.

#### All card options

```yaml
type: custom:email-inbox-card
entity: sensor.gmail_inbox       # sensor.gmail_inbox or sensor.microsoft_365_inbox
entry_id: abc1234def5678         # required — from Step 3 above
title: Unread Emails             # card header text  (default: "Unread Emails")
max_display: 20                  # maximum unread tiles shown  (default: 20)
tile_width: 260                  # width of each tile in px  (default: 260)
confirm_delete: true             # show confirmation dialog before deleting  (default: true)
```

The card displays only **unread** messages. Each tile shows a colour-coded sender avatar, sender name, date, subject, and a preview snippet. Click any tile to open a full popup reader showing the complete message body. Buttons for Mark as Read and Delete appear on each tile and inside the popup. The card refreshes automatically every 5 minutes; click the refresh icon in the header to force an immediate update.

---

## Sensors Reference

Two sensors are created per configured account:

| Entity | State | Purpose |
|--------|-------|---------|
| `sensor.gmail_unread_count` | `3` | Number of unread emails |
| `sensor.gmail_inbox` | Latest subject | Full email list + metadata as attributes |
| `sensor.microsoft_365_unread_count` | `1` | Number of unread emails |
| `sensor.microsoft_365_inbox` | Latest subject | Full email list + metadata as attributes |

### Inbox sensor attributes

```yaml
emails:
  - id: "18c1a2b3d4e5f"
    subject: "Meeting Tomorrow at 10am"
    from: "Alice Smith <alice@company.com>"
    date: "2025-03-10T14:30:00Z"
    snippet: "Hi, just a reminder that we have a team standup..."
    unread: true
  - id: "18c0a9b8c7d6e"
    subject: "Your order has shipped"
    from: "noreply@shop.com"
    date: "2025-03-09T09:15:00Z"
    snippet: "Your order #12345 is on its way..."
    unread: false
unread_count: 1
latest_sender: "Alice Smith <alice@company.com>"
latest_subject: "Meeting Tomorrow at 10am"
latest_date: "2025-03-10T14:30:00Z"
provider: gmail
account: you@gmail.com
```

---

## Services

### `email_inbox.delete_email`

Moves an email to Trash (Gmail) or Deleted Items (Microsoft 365).

```yaml
service: email_inbox.delete_email
data:
  entry_id: "abc1234def5678"
  message_id: "18c1a2b3d4e5f"
```

### `email_inbox.mark_read`

Removes the unread flag from an email.

```yaml
service: email_inbox.mark_read
data:
  entry_id: "abc1234def5678"
  message_id: "18c1a2b3d4e5f"
```

The `message_id` values come from the `emails` list in the inbox sensor attributes. The `entry_id` is found under Settings → Integrations → Email Inbox → your account → ⋮ → System information.

---

## Additional Lovelace Examples

### Glance card — unread counts for both providers

```yaml
type: glance
title: Email
entities:
  - entity: sensor.gmail_unread_count
    name: Gmail
    icon: mdi:gmail
  - entity: sensor.microsoft_365_unread_count
    name: Outlook
    icon: mdi:microsoft-outlook
```

### Markdown card — simple read-only email list

```yaml
type: markdown
content: >
  ## 📬 Gmail
  {% set emails = state_attr('sensor.gmail_inbox', 'emails') %}
  {% if emails %}
    {% for email in emails | selectattr('unread') | list | first(5) %}
    **{{ email.subject }}**
    {{ email.from }} · {{ email.date[:10] }}
    {{ email.snippet[:120] }}
    ---
    {% endfor %}
  {% else %}
    No emails.
  {% endif %}
```

---

## Automation Examples

### Notify on new unread email

```yaml
automation:
  - alias: "Notify — New unread email"
    trigger:
      - platform: state
        entity_id: sensor.gmail_unread_count
    condition:
      - condition: template
        value_template: "{{ trigger.to_state.state | int > trigger.from_state.state | int }}"
    action:
      - service: notify.mobile_app_your_phone
        data:
          title: "📧 New Email"
          message: >
            {{ state_attr('sensor.gmail_inbox', 'latest_subject') }}
            — from {{ state_attr('sensor.gmail_inbox', 'latest_sender') }}
```

### Auto-delete newsletter emails

```yaml
automation:
  - alias: "Auto-delete newsletters"
    trigger:
      - platform: state
        entity_id: sensor.gmail_inbox
    action:
      - repeat:
          for_each: >
            {{ state_attr('sensor.gmail_inbox', 'emails')
               | selectattr('from', 'search', 'newsletter@example.com')
               | map(attribute='id') | list }}
          sequence:
            - service: email_inbox.delete_email
              data:
                entry_id: "abc1234def5678"
                message_id: "{{ repeat.item }}"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Integration not found after install | Make sure you restarted Home Assistant fully after installing, not just reloaded YAML. Go to Settings → System → Restart. |
| "Invalid state" error during setup | You are using the wrong redirect URI. Make sure your Google/Azure app has `https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback` registered — not `/auth/external/callback`. |
| "No reply address" / redirect_uri mismatch | The URI registered in your OAuth app does not exactly match. Check for missing `https://`, wrong port, extra trailing slash, or typos. Copy and paste rather than typing. |
| `no_code_received` after clicking Allow | The browser redirected to your HA instance but nothing was stored. Confirm HA is reachable at the public URL. Try visiting `https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback` in your browser — you should see a plain page, not a connection error. |
| `oauth_error` — token exchange failed | Check your Client Secret is copied correctly (Azure: copy the **Value** column, not the ID column). For Gmail, confirm the app type is **Web application**, not Desktop. |
| Gmail "This app is blocked" | Your Google OAuth app is in testing mode. Go to OAuth consent screen → Test users → add your Gmail address. |
| Gmail 403 on delete or mark-read | Your OAuth app's scope is `gmail.readonly`. Re-create the credentials with scope `https://www.googleapis.com/auth/gmail.modify`, then remove and re-add the integration so a fresh token is issued. |
| Microsoft 365 403 on delete or mark-read | Your Azure app only has `Mail.Read` permission. In Azure Portal → API permissions: remove `Mail.Read`, add `Mail.ReadWrite` (Delegated), click Grant admin consent. Then remove and re-add the integration in HA — the existing token cannot be upgraded without a fresh OAuth flow. |
| Sensors show `unavailable` | Check Settings → System → Logs for details. The most common cause is an expired refresh token — remove and re-add the integration. |
| Card not appearing in "Add card" list | The resource was not registered or the browser cache was not cleared. Go to Settings → Dashboards → ⋮ → Resources and confirm `/local/email-inbox-card.js` is listed as a JavaScript module. Then hard-refresh: Ctrl+Shift+R / Cmd+Shift+R. |
| Card shows "Sensor unavailable" | The `entity` value in your card YAML does not match the actual entity ID. Go to Settings → Integrations → Email Inbox → your account to confirm the exact entity IDs created. |
| Popup does not open | Confirm you have cleared the browser cache after updating the card JS file. Check the browser console (F12 → Console) for errors. |
| Delete / mark-read fails | Confirm `entry_id` in your card YAML matches the entry ID shown in Settings → Integrations → Email Inbox → ⋮ → System information. |

---

## Architecture Notes

**OAuth callback:** The integration registers a custom HTTP endpoint at `/api/email_inbox/oauth_callback`. This intentionally avoids HA's built-in `/auth/external/callback` path, which validates a state token it generates itself and rejects anything it didn't create ("Invalid state"). The custom endpoint stores the authorization code in memory, and the config flow collects it when you click Submit.

**Lovelace card popup:** The email reader popup is rendered as a `<div>` appended directly to `document.body`, completely outside all shadow DOM trees. This is necessary because `position: fixed` inside a shadow root is clipped by the shadow host's stacking context in HA's multi-shadow-DOM layout — the popup would be invisible or clipped. Rendering on `document.body` ensures it covers the full viewport correctly.

**Full-width card:** The card implements `getGridOptions()` returning `{ columns: 12 }` to tell HA's Lovelace grid to assign all 12 columns to this card. The shadow host also applies `grid-column: 1 / -1` as a CSS fallback for older HA versions.

---

## License

MIT License — see [LICENSE](LICENSE)

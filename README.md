# Email Inbox — Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2023.1%2B-blue)](https://www.home-assistant.io/)

Display **Gmail** and **Microsoft 365 / Outlook** emails directly in Home Assistant, with a custom Lovelace card that supports deleting and marking emails as read — all without ever storing your password.

---

## Features

- 📬 **Unread count sensor** — live badge showing how many unread emails you have
- 📋 **Inbox sensor** — latest subject as the state value; full email list (subject, sender, date, snippet, read/unread) as attributes
- 🗑️ **Delete emails** — move to Trash (Gmail) or Deleted Items (Microsoft 365) from HA
- ✅ **Mark as read** — clear the unread flag from any email
- 🃏 **Custom Lovelace card** — rich email list UI with per-email action buttons and confirmation dialogs
- 🔄 **Auto-refresh** every 5 minutes, with a manual refresh button on the card
- 🔒 **OAuth2 authentication** — tokens stored securely, auto-refreshed; no password ever saved
- ⚙️ **Config Flow UI** — fully set up from Settings → Integrations, no YAML required
- 🔁 **Options flow** — change folders, labels, or email count without re-authenticating
- 🔗 **Custom OAuth callback** — uses `/api/email_inbox/oauth_callback` to avoid HA's internal state validation entirely

---

## Requirements

- Home Assistant **2023.1** or newer
- Your HA instance must be reachable at a **public HTTPS URL** (needed for the OAuth redirect)
- A **Google Cloud** or **Azure** account to create an OAuth2 app (free)

---

## Installation via HACS

1. In HACS → Integrations → ⋮ → **Custom repositories**
2. Add your repository URL and set category to **Integration**
3. Search for **Email Inbox** → Install
4. Restart Home Assistant
5. Follow the **Lovelace Card** steps below to install the frontend card

---

## OAuth2 App Setup

Both providers require you to register a redirect URI **before** starting the HA config flow. The exact URI to register is:

```
https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
```

> ℹ️ If you access Home Assistant via a different URL, substitute that base URL. The path `/api/email_inbox/oauth_callback` must remain exactly as shown.

---

### Gmail (Google Cloud Console)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create or select a project
2. **APIs & Services → Library** → search for **Gmail API** → Enable it
3. **APIs & Services → OAuth consent screen**
   - Choose **External** (or Internal if using Google Workspace)
   - Fill in app name, support email
   - Under **Scopes**, add: `https://www.googleapis.com/auth/gmail.modify`
     *(This allows reading, trashing, and marking emails as read. `gmail.readonly` will cause a 403 error on delete and mark-read actions.)*
   - Under **Test users**, add your Gmail address
4. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Under **Authorised redirect URIs** add:
     ```
     https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
     ```
5. Copy the **Client ID** and **Client Secret**

> ⚠️ Do **not** use "Desktop app" type — Google deprecated the out-of-band flow for Desktop apps and it will fail. Use **Web application**.

---

### Microsoft 365 / Outlook (Azure Portal)

1. Go to [portal.azure.com](https://portal.azure.com/) → **Azure Active Directory → App registrations → New registration**
   - Name: anything (e.g. "Home Assistant Email")
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: choose **Web** and enter:
     ```
     https://homeassistant.peterborough.madasc.com:8123/api/email_inbox/oauth_callback
     ```
2. After creating, go to **Authentication**
   - Confirm the redirect URI is listed under **Web**
   - Enable **ID tokens** (optional but harmless)
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**
   - Add `Mail.ReadWrite` (required for delete and mark-as-read — `Mail.Read` alone will cause a 403 error on any write action)
   - Click **Grant admin consent** (required even for personal accounts on some tenants)
4. **Certificates & secrets → New client secret**
   - Copy the **Value** (not the Secret ID) — it's only shown once
5. Copy the **Application (client) ID** from the Overview page

---

## Home Assistant Setup

1. **Settings → Integrations → Add Integration** → search **Email Inbox**
2. Select your provider (Gmail or Microsoft 365)
3. Enter your **Client ID** and **Client Secret**
4. A link to the provider's authorization page is shown — click it, sign in, and approve access
5. Your browser will redirect to your HA instance and show a green success page — come back to HA and click **Submit**
6. Configure your labels/folders and how many emails to retrieve (1–50)

The integration creates two sensors per account and registers the delete/mark-read services automatically.

---

## Lovelace Card Installation

The custom card file is included in the integration at `www/email-inbox-card.js`.

### Step 1 — Copy the file

After installing the integration, copy the card to your HA www folder:

```
/config/www/email-inbox-card.js
```

If installing manually, copy it from:
```
custom_components/email_inbox/www/email-inbox-card.js → /config/www/email-inbox-card.js
```

### Step 2 — Register the resource

**Settings → Dashboards → ⋮ → Resources → Add resource**

| Field | Value |
|-------|-------|
| URL | `/local/email-inbox-card.js` |
| Resource type | JavaScript module |

Reload the browser (hard refresh / Ctrl+Shift+R) after adding the resource.

### Step 3 — Add the card

In any dashboard, add a **Manual card** with this configuration:

```yaml
type: custom:email-inbox-card
entity: sensor.gmail_inbox
entry_id: YOUR_CONFIG_ENTRY_ID
title: Gmail Inbox
```

#### Finding your Entry ID

Settings → Integrations → **Email Inbox** → click your account → ⋮ → **System information** — copy the entry ID shown there.

#### Full card options

```yaml
type: custom:email-inbox-card
entity: sensor.gmail_inbox          # or sensor.microsoft_365_inbox
entry_id: abc123def456              # required — your config entry ID
title: Unread Emails                # card header label (default: "Unread Emails")
max_display: 20                     # max unread tiles to show (default: 20)
tile_width: 260                     # width of each email tile in px (default: 260)
confirm_delete: true                # show confirmation dialog before deleting (default: true)
```

The card shows only **unread** messages in a horizontally scrollable strip. Each tile shows the sender avatar, name, date, subject, and a snippet. Click any tile to open a full-screen popup reader that loads the complete message body. Delete and mark-as-read buttons appear on each tile and inside the popup.

---

## Sensors Reference

Two sensors are created for every configured account:

| Entity (example) | State | Purpose |
|------------------|-------|---------|
| `sensor.gmail_unread_count` | `3` | Number of unread emails |
| `sensor.gmail_inbox` | Latest email subject | Full email list + metadata |
| `sensor.microsoft_365_unread_count` | `1` | Number of unread emails |
| `sensor.microsoft_365_inbox` | Latest email subject | Full email list + metadata |

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

Two services are registered that can be called from automations, scripts, or the card:

### `email_inbox.delete_email`

Moves an email to Trash (Gmail) or Deleted Items (Microsoft 365).

```yaml
service: email_inbox.delete_email
data:
  entry_id: "abc123def456"
  message_id: "18c1a2b3d4e5f"
```

### `email_inbox.mark_read`

Removes the unread flag from an email.

```yaml
service: email_inbox.mark_read
data:
  entry_id: "abc123def456"
  message_id: "18c1a2b3d4e5f"
```

> The `message_id` values come from the `emails` attribute on the inbox sensor. The `entry_id` is your config entry ID (see Finding your Entry ID above).

---

## Additional Lovelace Examples

### Glance card — both providers side by side

```yaml
type: glance
title: Email Overview
entities:
  - entity: sensor.gmail_unread_count
    name: Gmail
    icon: mdi:gmail
  - entity: sensor.microsoft_365_unread_count
    name: Outlook
    icon: mdi:microsoft-outlook
```

### Markdown card — simple email list (no delete button)

```yaml
type: markdown
content: >
  ## 📬 Gmail
  {% set emails = state_attr('sensor.gmail_inbox', 'emails') %}
  {% if emails %}
    {% for email in emails[:5] %}
    **{{ '🔵' if email.unread else '⚪' }} {{ email.subject }}**
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

### Auto-delete emails from a specific sender

```yaml
automation:
  - alias: "Auto-delete newsletter emails"
    trigger:
      - platform: state
        entity_id: sensor.gmail_inbox
    action:
      - service: email_inbox.delete_email
        data:
          entry_id: "abc123def456"
          message_id: >
            {% set emails = state_attr('sensor.gmail_inbox', 'emails') %}
            {% for e in emails if 'newsletter@example.com' in e.from %}
              {{ e.id }}
            {% endfor %}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid state" error during setup | Ensure you are using the redirect URI `/api/email_inbox/oauth_callback`, **not** `/auth/external/callback`. Update your Google/Azure app registration. |
| "No reply address" / redirect_uri mismatch | The URI in your Google/Azure app must match **exactly** — including `https://`, the port `:8123`, and the path. No trailing slash. |
| `no_code_received` error after authorizing | The browser redirect didn't reach HA. Check your HA external URL is correct and publicly reachable. Try opening the callback URL in a browser directly. |
| `oauth_error` — token exchange failed | Double-check your Client Secret (not the Secret ID for Azure). For Gmail, ensure the OAuth app type is **Web application**, not Desktop. |
| Sensors show `unavailable` | Check HA logs under Settings → System → Logs. Token may have expired — remove and re-add the integration. |
| Gmail "This app is blocked" | Your Google OAuth app is in testing mode — go to OAuth consent screen and add your Gmail address as a **Test user**. |
| `Failed to delete/mark-read … HTTP 403` | **Step 1:** Azure Portal → App registrations → your app → API permissions → remove `Mail.Read` → add `Mail.ReadWrite` (Delegated) → click **Grant admin consent**. **Step 2:** In HA, remove the Microsoft 365 integration entry and re-add it so a fresh token with the new scope is issued. The old token cannot be upgraded without re-authentication. |
| `Mail.ReadWrite` permission denied (M365) | Go to Azure Portal → API permissions → Grant admin consent. Required even for personal accounts on some tenants. |
| Card shows "Sensor unavailable" | Confirm the `entity` in the card config matches your actual sensor entity ID. Check the integration loaded correctly after HA restart. |
| Delete / mark-read not working | Confirm the `entry_id` in the card config is correct. Find it under Settings → Integrations → Email Inbox → your account → ⋮ → System information. |

---

## Architecture Notes

The OAuth flow uses a custom HTTP view registered at `/api/email_inbox/oauth_callback`. This is intentionally **not** `/auth/external/callback` — HA's built-in callback path validates a state token it generates itself and will reject anything else with "Invalid state". The custom path sidesteps this entirely: the integration generates its own `state` token, the provider sends the code to the custom view, which stores it in memory, and the config flow collects it when the user clicks Submit.

---

## License

MIT License — see [LICENSE](LICENSE)

"""Constants for the Email Inbox integration."""

DOMAIN = "email_inbox"
PLATFORMS = ["sensor"]

# Provider types
PROVIDER_GMAIL = "gmail"
PROVIDER_MICROSOFT365 = "microsoft365"

# Config keys
CONF_PROVIDER = "provider"
CONF_CLIENT_ID = "client_id"
CONF_CLIENT_SECRET = "client_secret"
CONF_EMAIL_ADDRESS = "email_address"
CONF_MAX_EMAILS = "max_emails"
CONF_LABELS = "labels"
CONF_FOLDERS = "folders"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_TOKEN_DATA = "token_data"

# Defaults
DEFAULT_MAX_EMAILS = 10
DEFAULT_SCAN_INTERVAL = 5  # minutes
DEFAULT_GMAIL_LABELS = ["INBOX"]
DEFAULT_M365_FOLDERS = ["Inbox"]

# Gmail OAuth2 scopes
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
]

# Gmail API endpoints
GMAIL_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
GMAIL_TOKEN_URI = "https://oauth2.googleapis.com/token"

# Microsoft OAuth2 scopes
MICROSOFT_SCOPES = [
    "https://graph.microsoft.com/Mail.ReadWrite",
    "offline_access",
]
MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common"
MICROSOFT_GRAPH_API = "https://graph.microsoft.com/v1.0"

# Sensor attributes
ATTR_EMAILS = "emails"
ATTR_UNREAD_COUNT = "unread_count"
ATTR_LATEST_SENDER = "latest_sender"
ATTR_LATEST_SUBJECT = "latest_subject"
ATTR_LATEST_DATE = "latest_date"
ATTR_PROVIDER = "provider"
ATTR_ACCOUNT = "account"

# Update interval
UPDATE_INTERVAL_MINUTES = 5

# Icons
ICON_GMAIL = "mdi:gmail"
ICON_MICROSOFT365 = "mdi:microsoft-outlook"
ICON_UNREAD = "mdi:email-alert"
ICON_READ = "mdi:email-open"

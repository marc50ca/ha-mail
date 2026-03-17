"""Config flow for Email Inbox integration.

Uses a custom OAuth callback view (/api/email_inbox/oauth_callback) so that
HA's own /auth/external/callback — and its state validation — are never
involved. This fixes the 'Invalid state' error.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from typing import Any
from urllib.parse import urlencode

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.network import get_url, NoURLAvailableError

from .const import (
    DOMAIN,
    CONF_PROVIDER,
    CONF_CLIENT_ID,
    CONF_CLIENT_SECRET,
    CONF_MAX_EMAILS,
    CONF_LABELS,
    CONF_FOLDERS,
    CONF_TOKEN_DATA,
    PROVIDER_GMAIL,
    PROVIDER_MICROSOFT365,
    DEFAULT_MAX_EMAILS,
    GMAIL_AUTH_URI,
    GMAIL_TOKEN_URI,
    GMAIL_SCOPES,
    MICROSOFT_AUTHORITY,
    MICROSOFT_SCOPES,
)
from .oauth_callback_view import (
    EmailInboxOAuthCallbackView,
    get_callback_url,
    pop_pending_code,
)

_LOGGER = logging.getLogger(__name__)

FALLBACK_HA_URL = "https://homeassistant.peterborough.madasc.com:8123"

# How long (seconds) to poll for the OAuth callback before giving up
POLL_TIMEOUT = 300
POLL_INTERVAL = 2


def _get_ha_url(hass) -> str:
    try:
        return get_url(hass, allow_internal=False, allow_ip=False)
    except NoURLAvailableError:
        try:
            return get_url(hass, allow_internal=True)
        except NoURLAvailableError:
            return FALLBACK_HA_URL


class EmailInboxConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Email Inbox."""

    VERSION = 1

    def __init__(self) -> None:
        self._provider: str | None = None
        self._client_id: str | None = None
        self._client_secret: str | None = None
        self._token_data: dict = {}
        self._state: str = secrets.token_urlsafe(32)
        self._redirect_uri: str = ""

    # ------------------------------------------------------------------ #
    #  Step 1 — choose provider                                            #
    # ------------------------------------------------------------------ #
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            self._provider = user_input[CONF_PROVIDER]
            return await self.async_step_credentials()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_PROVIDER): vol.In(
                        {
                            PROVIDER_GMAIL: "Gmail (Google)",
                            PROVIDER_MICROSOFT365: "Microsoft 365 / Outlook",
                        }
                    )
                }
            ),
        )

    # ------------------------------------------------------------------ #
    #  Step 2 — enter Client ID + Secret, show redirect URI to register   #
    # ------------------------------------------------------------------ #
    async def async_step_credentials(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        # Register the HTTP view as early as possible
        self.hass.http.register_view(EmailInboxOAuthCallbackView)

        ha_url = _get_ha_url(self.hass)
        self._redirect_uri = get_callback_url(ha_url)

        if user_input is not None:
            self._client_id = user_input[CONF_CLIENT_ID].strip()
            self._client_secret = user_input[CONF_CLIENT_SECRET].strip()
            if not self._client_id or not self._client_secret:
                errors["base"] = "missing_credentials"
            else:
                return await self.async_step_oauth_authorize()

        return self.async_show_form(
            step_id="credentials",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_CLIENT_ID): str,
                    vol.Required(CONF_CLIENT_SECRET): str,
                }
            ),
            errors=errors,
            description_placeholders={"redirect_uri": self._redirect_uri},
        )

    # ------------------------------------------------------------------ #
    #  Step 3 — open auth URL, wait for browser callback, auto-advance    #
    # ------------------------------------------------------------------ #
    async def async_step_oauth_authorize(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Show the auth link.  User clicks it, browser redirects to our
        custom view, then they click Next to let us poll for the code."""
        errors: dict[str, str] = {}

        auth_url = (
            self._build_gmail_auth_url()
            if self._provider == PROVIDER_GMAIL
            else self._build_microsoft_auth_url()
        )

        if user_input is not None:
            # User has come back after authorizing — check for the code
            result = pop_pending_code(self._state)

            if result is None:
                errors["base"] = "no_code_received"
            elif result.get("error"):
                _LOGGER.error("OAuth error from provider: %s", result["error"])
                errors["base"] = "oauth_provider_error"
            else:
                code = result["code"]
                try:
                    self._token_data = await self._async_exchange_code(code)
                    return await self.async_step_settings()
                except Exception as err:
                    _LOGGER.error("Token exchange failed: %s", err)
                    errors["base"] = "oauth_error"

        return self.async_show_form(
            step_id="oauth_authorize",
            # Just a confirmation click — the actual code comes from the callback view
            data_schema=vol.Schema({}),
            errors=errors,
            description_placeholders={
                "auth_url": auth_url,
                "redirect_uri": self._redirect_uri,
            },
        )

    # ------------------------------------------------------------------ #
    #  Step 4 — folders / labels / preferences                            #
    # ------------------------------------------------------------------ #
    async def async_step_settings(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            config_data: dict[str, Any] = {
                CONF_PROVIDER: self._provider,
                CONF_CLIENT_ID: self._client_id,
                CONF_CLIENT_SECRET: self._client_secret,
                CONF_TOKEN_DATA: self._token_data,
                CONF_MAX_EMAILS: user_input.get(CONF_MAX_EMAILS, DEFAULT_MAX_EMAILS),
            }
            if self._provider == PROVIDER_GMAIL:
                config_data[CONF_LABELS] = [
                    l.strip() for l in user_input.get("labels", "INBOX").split(",")
                ]
            else:
                config_data[CONF_FOLDERS] = [
                    f.strip() for f in user_input.get("folders", "Inbox").split(",")
                ]

            account = self._token_data.get("email", self._provider)
            label = "Gmail" if self._provider == PROVIDER_GMAIL else "Microsoft 365"
            return self.async_create_entry(title=f"{account} ({label})", data=config_data)

        if self._provider == PROVIDER_GMAIL:
            schema = vol.Schema({
                vol.Optional("labels", default="INBOX"): str,
                vol.Optional(CONF_MAX_EMAILS, default=DEFAULT_MAX_EMAILS): vol.All(
                    int, vol.Range(min=1, max=50)
                ),
            })
        else:
            schema = vol.Schema({
                vol.Optional("folders", default="Inbox"): str,
                vol.Optional(CONF_MAX_EMAILS, default=DEFAULT_MAX_EMAILS): vol.All(
                    int, vol.Range(min=1, max=50)
                ),
            })

        return self.async_show_form(step_id="settings", data_schema=schema, errors=errors)

    # ------------------------------------------------------------------ #
    #  OAuth helpers                                                        #
    # ------------------------------------------------------------------ #
    def _build_gmail_auth_url(self) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": self._redirect_uri,
            "response_type": "code",
            "scope": " ".join(GMAIL_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": self._state,
        }
        return f"{GMAIL_AUTH_URI}?{urlencode(params)}"

    def _build_microsoft_auth_url(self) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": self._redirect_uri,
            "response_type": "code",
            "scope": " ".join(MICROSOFT_SCOPES),
            "state": self._state,
            "prompt": "select_account",
        }
        return f"{MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?{urlencode(params)}"

    async def _async_exchange_code(self, auth_code: str) -> dict:
        import aiohttp

        if self._provider == PROVIDER_GMAIL:
            token_url = GMAIL_TOKEN_URI
            payload = {
                "code": auth_code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": self._redirect_uri,
                "grant_type": "authorization_code",
            }
        else:
            token_url = f"{MICROSOFT_AUTHORITY}/oauth2/v2.0/token"
            payload = {
                "code": auth_code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": self._redirect_uri,
                "grant_type": "authorization_code",
                "scope": " ".join(MICROSOFT_SCOPES),
            }

        async with aiohttp.ClientSession() as session:
            async with session.post(token_url, data=payload) as resp:
                data = await resp.json()
                if resp.status != 200:
                    raise Exception(
                        f"Token exchange failed ({resp.status}): "
                        f"{data.get('error_description', data)}"
                    )

        token_data: dict[str, Any] = {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
        }

        # Resolve the account email
        try:
            headers = {"Authorization": f"Bearer {token_data['access_token']}"}
            async with aiohttp.ClientSession() as session:
                if self._provider == PROVIDER_GMAIL:
                    async with session.get(
                        "https://www.googleapis.com/oauth2/v2/userinfo", headers=headers
                    ) as resp:
                        info = await resp.json()
                        token_data["email"] = info.get("email", "")
                else:
                    async with session.get(
                        "https://graph.microsoft.com/v1.0/me",
                        headers=headers,
                        params={"$select": "mail,userPrincipalName"},
                    ) as resp:
                        info = await resp.json()
                        token_data["email"] = (
                            info.get("mail") or info.get("userPrincipalName", "")
                        )
        except Exception as err:
            _LOGGER.warning("Could not resolve account email: %s", err)

        return token_data

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return EmailInboxOptionsFlow(config_entry)


# ------------------------------------------------------------------ #
#  Options flow                                                         #
# ------------------------------------------------------------------ #
class EmailInboxOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry) -> None:
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}
        provider = self.config_entry.data.get(CONF_PROVIDER, PROVIDER_GMAIL)

        if user_input is not None:
            new_data = {**self.config_entry.data}
            new_data[CONF_MAX_EMAILS] = user_input.get(CONF_MAX_EMAILS, DEFAULT_MAX_EMAILS)
            if provider == PROVIDER_GMAIL:
                new_data[CONF_LABELS] = [
                    l.strip() for l in user_input.get("labels", "INBOX").split(",")
                ]
            else:
                new_data[CONF_FOLDERS] = [
                    f.strip() for f in user_input.get("folders", "Inbox").split(",")
                ]
            self.hass.config_entries.async_update_entry(self.config_entry, data=new_data)
            return self.async_create_entry(title="", data={})

        current_max = self.config_entry.data.get(CONF_MAX_EMAILS, DEFAULT_MAX_EMAILS)
        if provider == PROVIDER_GMAIL:
            current = ", ".join(self.config_entry.data.get(CONF_LABELS, ["INBOX"]))
            schema = vol.Schema({
                vol.Optional("labels", default=current): str,
                vol.Optional(CONF_MAX_EMAILS, default=current_max): vol.All(
                    int, vol.Range(min=1, max=50)
                ),
            })
        else:
            current = ", ".join(self.config_entry.data.get(CONF_FOLDERS, ["Inbox"]))
            schema = vol.Schema({
                vol.Optional("folders", default=current): str,
                vol.Optional(CONF_MAX_EMAILS, default=current_max): vol.All(
                    int, vol.Range(min=1, max=50)
                ),
            })

        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)

"""Email Inbox Integration — Gmail & Microsoft 365."""
from __future__ import annotations

import logging
from datetime import timedelta

import voluptuous as vol
import homeassistant.helpers.config_validation as cv

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    PLATFORMS,
    CONF_PROVIDER,
    CONF_TOKEN_DATA,
    CONF_MAX_EMAILS,
    CONF_LABELS,
    CONF_FOLDERS,
    CONF_CLIENT_ID,
    CONF_CLIENT_SECRET,
    PROVIDER_GMAIL,
    PROVIDER_MICROSOFT365,
    UPDATE_INTERVAL_MINUTES,
)
from .gmail_client import GmailClient
from .microsoft_client import MicrosoftClient
from .oauth_callback_view import EmailInboxOAuthCallbackView
from .api_view import EmailInboxMessageBodyView

_LOGGER = logging.getLogger(__name__)

SERVICE_DELETE_EMAIL = "delete_email"
SERVICE_MARK_READ = "mark_read"

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        vol.Required("message_id"): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Email Inbox component."""
    hass.data.setdefault(DOMAIN, {})
    # Register the OAuth callback view globally so it's available before any
    # config entry is created (needed during the setup wizard).
    hass.http.register_view(EmailInboxOAuthCallbackView)
    hass.http.register_view(EmailInboxMessageBodyView)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Email Inbox from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    provider = entry.data[CONF_PROVIDER]
    token_data = entry.data.get(CONF_TOKEN_DATA, {})
    client_id = entry.data[CONF_CLIENT_ID]
    client_secret = entry.data[CONF_CLIENT_SECRET]
    max_emails = entry.data.get(CONF_MAX_EMAILS, 10)

    if provider == PROVIDER_GMAIL:
        labels = entry.data.get(CONF_LABELS, ["INBOX"])
        client = GmailClient(
            hass=hass,
            client_id=client_id,
            client_secret=client_secret,
            token_data=token_data,
            labels=labels,
            max_emails=max_emails,
        )
    elif provider == PROVIDER_MICROSOFT365:
        folders = entry.data.get(CONF_FOLDERS, ["Inbox"])
        client = MicrosoftClient(
            hass=hass,
            client_id=client_id,
            client_secret=client_secret,
            token_data=token_data,
            folders=folders,
            max_emails=max_emails,
        )
    else:
        _LOGGER.error("Unknown email provider: %s", provider)
        return False

    async def async_update_data():
        try:
            data = await client.async_fetch_emails()
            new_token = client.get_token_data()
            if new_token != token_data:
                hass.config_entries.async_update_entry(
                    entry, data={**entry.data, CONF_TOKEN_DATA: new_token}
                )
            return data
        except Exception as err:
            raise UpdateFailed(f"Error fetching emails: {err}") from err

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name=f"email_inbox_{entry.entry_id}",
        update_method=async_update_data,
        update_interval=timedelta(minutes=UPDATE_INTERVAL_MINUTES),
    )

    try:
        await coordinator.async_config_entry_first_refresh()
    except Exception as err:
        raise ConfigEntryNotReady(f"Unable to connect to email provider: {err}") from err

    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "client": client,
        "provider": provider,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # ------------------------------------------------------------------ #
    #  Services                                                             #
    # ------------------------------------------------------------------ #
    async def handle_delete_email(call: ServiceCall) -> None:
        """Service: email_inbox.delete_email."""
        entry_id = call.data["entry_id"]
        message_id = call.data["message_id"]
        entry_data = hass.data[DOMAIN].get(entry_id)
        if not entry_data:
            _LOGGER.error("delete_email: unknown entry_id %s", entry_id)
            return
        await entry_data["client"].async_delete_email(message_id)
        await entry_data["coordinator"].async_request_refresh()

    async def handle_mark_read(call: ServiceCall) -> None:
        """Service: email_inbox.mark_read."""
        entry_id = call.data["entry_id"]
        message_id = call.data["message_id"]
        entry_data = hass.data[DOMAIN].get(entry_id)
        if not entry_data:
            _LOGGER.error("mark_read: unknown entry_id %s", entry_id)
            return
        await entry_data["client"].async_mark_read(message_id)
        await entry_data["coordinator"].async_request_refresh()

    if not hass.services.has_service(DOMAIN, SERVICE_DELETE_EMAIL):
        hass.services.async_register(
            DOMAIN, SERVICE_DELETE_EMAIL, handle_delete_email, schema=SERVICE_SCHEMA
        )
    if not hass.services.has_service(DOMAIN, SERVICE_MARK_READ):
        hass.services.async_register(
            DOMAIN, SERVICE_MARK_READ, handle_mark_read, schema=SERVICE_SCHEMA
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok

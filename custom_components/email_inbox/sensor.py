"""Sensor platform for Email Inbox integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_PROVIDER,
    CONF_EMAIL_ADDRESS,
    PROVIDER_GMAIL,
    PROVIDER_MICROSOFT365,
    ATTR_EMAILS,
    ATTR_UNREAD_COUNT,
    ATTR_LATEST_SENDER,
    ATTR_LATEST_SUBJECT,
    ATTR_LATEST_DATE,
    ATTR_PROVIDER,
    ATTR_ACCOUNT,
    ICON_GMAIL,
    ICON_MICROSOFT365,
    ICON_UNREAD,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Email Inbox sensor entries."""
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]
    provider = data["provider"]

    entities = [
        EmailUnreadCountSensor(coordinator, entry, provider),
        EmailInboxSensor(coordinator, entry, provider),
    ]
    async_add_entities(entities, True)


class EmailUnreadCountSensor(CoordinatorEntity, SensorEntity):
    """Sensor showing unread email count."""

    def __init__(self, coordinator, entry: ConfigEntry, provider: str) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._entry = entry
        self._provider = provider
        self._attr_unique_id = f"{entry.entry_id}_unread_count"
        self._attr_name = f"{self._provider_display_name} Unread Count"
        self._attr_native_unit_of_measurement = "emails"
        self._attr_icon = ICON_UNREAD

    @property
    def _provider_display_name(self) -> str:
        if self._provider == PROVIDER_GMAIL:
            return "Gmail"
        return "Microsoft 365"

    @property
    def native_value(self) -> int:
        """Return the number of unread emails."""
        if self.coordinator.data is None:
            return 0
        return self.coordinator.data.get("unread_count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra state attributes."""
        if self.coordinator.data is None:
            return {}
        return {
            ATTR_PROVIDER: self._provider,
            ATTR_ACCOUNT: self.coordinator.data.get("account", ""),
        }

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": f"Email Inbox ({self._provider_display_name})",
            "manufacturer": "Email Inbox Integration",
            "model": self._provider_display_name,
        }


class EmailInboxSensor(CoordinatorEntity, SensorEntity):
    """Sensor showing inbox emails with full list as attributes."""

    def __init__(self, coordinator, entry: ConfigEntry, provider: str) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._entry = entry
        self._provider = provider
        self._attr_unique_id = f"{entry.entry_id}_inbox"
        self._attr_name = f"{self._provider_display_name} Inbox"
        self._attr_icon = ICON_GMAIL if provider == PROVIDER_GMAIL else ICON_MICROSOFT365

    @property
    def _provider_display_name(self) -> str:
        if self._provider == PROVIDER_GMAIL:
            return "Gmail"
        return "Microsoft 365"

    @property
    def native_value(self) -> str:
        """Return the subject of the latest email."""
        emails = self._get_emails()
        if not emails:
            return "No emails"
        return emails[0].get("subject", "No Subject")[:255]

    def _get_emails(self) -> list[dict]:
        if self.coordinator.data is None:
            return []
        return self.coordinator.data.get("emails", [])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the full email list and metadata as attributes."""
        if self.coordinator.data is None:
            return {}

        emails = self._get_emails()
        latest = emails[0] if emails else {}

        # Build clean email list for attributes — id MUST be included for
        # delete / mark-read services to work from the Lovelace card.
        email_list = []
        for email in emails:
            email_list.append({
                "id": email.get("id", ""),
                "subject": email.get("subject", "")[:200],
                "from": email.get("from", "")[:200],
                "date": email.get("date", ""),
                "snippet": email.get("snippet", "")[:300],
                "unread": email.get("unread", False),
            })

        return {
            ATTR_EMAILS: email_list,
            ATTR_UNREAD_COUNT: self.coordinator.data.get("unread_count", 0),
            ATTR_LATEST_SENDER: latest.get("from", "")[:200],
            ATTR_LATEST_SUBJECT: latest.get("subject", "")[:200],
            ATTR_LATEST_DATE: latest.get("date", ""),
            ATTR_PROVIDER: self._provider,
            ATTR_ACCOUNT: self.coordinator.data.get("account", ""),
        }

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": f"Email Inbox ({self._provider_display_name})",
            "manufacturer": "Email Inbox Integration",
            "model": self._provider_display_name,
        }

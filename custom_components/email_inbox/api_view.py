"""REST API view for Email Inbox — fetches full message body.

Endpoint: GET /api/email_inbox/message_body
Query params:
  - entry_id: config entry ID
  - message_id: provider message ID

Returns JSON: { "subject": "...", "from": "...", "date": "...", "body_html": "...", "body_text": "..." }

Requires HA authentication (Authorization: Bearer <long-lived-access-token>).
"""
from __future__ import annotations

import logging
from http import HTTPStatus

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

_LOGGER = logging.getLogger(__name__)


class EmailInboxMessageBodyView(HomeAssistantView):
    """Return the full body of a single email message."""

    url = "/api/email_inbox/message_body"
    name = "api:email_inbox:message_body"
    requires_auth = True  # HA bearer token required

    async def get(self, request: web.Request) -> web.Response:
        """Handle GET /api/email_inbox/message_body?entry_id=...&message_id=..."""
        from . import DOMAIN

        hass = request.app["hass"]
        entry_id = request.rel_url.query.get("entry_id", "")
        message_id = request.rel_url.query.get("message_id", "")

        if not entry_id or not message_id:
            return self.json(
                {"error": "entry_id and message_id are required"},
                status_code=HTTPStatus.BAD_REQUEST,
            )

        domain_data = hass.data.get(DOMAIN, {})
        entry_data = domain_data.get(entry_id)
        if not entry_data:
            return self.json(
                {"error": f"Unknown entry_id: {entry_id}"},
                status_code=HTTPStatus.NOT_FOUND,
            )

        client = entry_data["client"]

        try:
            body = await client.async_fetch_message_body(message_id)
            return self.json(body)
        except Exception as err:
            _LOGGER.error("Failed to fetch message body %s: %s", message_id, err)
            return self.json(
                {"error": str(err)},
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

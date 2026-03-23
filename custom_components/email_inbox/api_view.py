"""REST API view for Email Inbox — fetches full message body.

Endpoint:  GET /api/email_inbox/message_body
Params:    entry_id, message_id
Returns:   application/json  { subject, from, to, date, body_html, body_text }

Key fix: uses explicit json.dumps(ensure_ascii=True) and returns a raw
aiohttp web.Response instead of HomeAssistantView.self.json().

HomeAssistantView.self.json() uses ensure_ascii=False, which emits Unicode
line/paragraph separators (U+2028, U+2029) as literal characters inside JSON
strings. JavaScript's JSON.parse treats those as line terminators and fails
with "unexpected non-whitespace character after JSON data".
"""
from __future__ import annotations

import json
import logging
import re
from http import HTTPStatus

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

_LOGGER = logging.getLogger(__name__)

# Characters that are valid in Python strings but break JS JSON.parse when
# emitted literally (i.e. when ensure_ascii=False is used):
#   U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR
# Plus C0/C1 control chars (except tab/newline/CR) that some parsers reject.
_UNSAFE_CHARS = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]"
)


def _safe_json(obj: object) -> str:
    """Serialise to JSON with ensure_ascii=True so no literal Unicode
    line-break characters appear in the output.  Also removes C0/C1
    control characters and U+2028/U+2029 from string values beforehand
    so the output is safe for all JS runtimes."""

    def _clean(o):
        if isinstance(o, str):
            return _UNSAFE_CHARS.sub(" ", o)
        if isinstance(o, dict):
            return {k: _clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [_clean(i) for i in o]
        return o

    return json.dumps(_clean(obj), ensure_ascii=True, separators=(",", ":"))


def _json_response(obj: object, status: int = 200) -> web.Response:
    return web.Response(
        text=_safe_json(obj),
        status=status,
        content_type="application/json",
        charset="utf-8",
    )


class EmailInboxMessageBodyView(HomeAssistantView):
    """Return the full body of a single email message."""

    url = "/api/email_inbox/message_body"
    name = "api:email_inbox:message_body"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        from . import DOMAIN

        hass = request.app["hass"]
        entry_id  = request.rel_url.query.get("entry_id",  "")
        message_id = request.rel_url.query.get("message_id", "")

        if not entry_id or not message_id:
            return _json_response(
                {"error": "entry_id and message_id are required"},
                status=HTTPStatus.BAD_REQUEST,
            )

        entry_data = hass.data.get(DOMAIN, {}).get(entry_id)
        if not entry_data:
            return _json_response(
                {"error": f"Unknown entry_id: {entry_id}"},
                status=HTTPStatus.NOT_FOUND,
            )

        try:
            body = await entry_data["client"].async_fetch_message_body(message_id)
            return _json_response(body)
        except Exception as err:
            _LOGGER.error("Failed to fetch message body %s: %s", message_id, err)
            return _json_response(
                {"error": str(err)},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

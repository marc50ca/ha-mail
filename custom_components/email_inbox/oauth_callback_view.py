"""Custom HTTP view to handle OAuth2 callbacks for Email Inbox.

Registers /api/email_inbox/oauth_callback so HA's own OAuth state
validation never runs — fixing the 'Invalid state' error.
"""
from __future__ import annotations

import logging
from http import HTTPStatus

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

_LOGGER = logging.getLogger(__name__)

# In-memory store: flow_state -> {"code": ..., "error": ...}
_PENDING_CODES: dict[str, dict] = {}

CALLBACK_PATH = "/api/email_inbox/oauth_callback"


class EmailInboxOAuthCallbackView(HomeAssistantView):
    """Handle the OAuth2 redirect from Google / Microsoft."""

    url = CALLBACK_PATH
    name = "api:email_inbox:oauth_callback"
    requires_auth = False  # Must be False — provider redirects unauthenticated

    async def get(self, request: web.Request) -> web.Response:
        """Receive ?code=...&state=... from the OAuth provider."""
        params = request.rel_url.query
        state = params.get("state", "")
        code = params.get("code", "")
        error = params.get("error", "")
        error_description = params.get("error_description", error)

        _LOGGER.debug(
            "OAuth callback received: state=%s code_present=%s error=%s",
            state,
            bool(code),
            error,
        )

        if not state:
            return web.Response(
                text="<html><body><h2>❌ Missing state parameter.</h2></body></html>",
                content_type="text/html",
                status=HTTPStatus.BAD_REQUEST,
            )

        if error:
            _PENDING_CODES[state] = {"code": None, "error": error_description}
            return web.Response(
                content_type="text/html",
                text=(
                    "<html><body>"
                    f"<h2>❌ Authorization failed</h2>"
                    f"<p>{error_description}</p>"
                    "<p>Close this window and check Home Assistant.</p>"
                    "</body></html>"
                ),
            )

        if not code:
            return web.Response(
                text="<html><body><h2>❌ No code in response.</h2></body></html>",
                content_type="text/html",
                status=HTTPStatus.BAD_REQUEST,
            )

        _PENDING_CODES[state] = {"code": code, "error": None}

        return web.Response(
            content_type="text/html",
            text=(
                "<html><head>"
                "<style>body{font-family:sans-serif;text-align:center;padding:60px;}"
                "h2{color:#22c55e;} p{color:#6b7280;}</style>"
                "</head><body>"
                "<h2>✅ Authorization successful!</h2>"
                "<p>You can close this window and return to Home Assistant.</p>"
                "</body></html>"
            ),
        )


def store_pending_code(state: str, code: str | None, error: str | None = None) -> None:
    """Store a code+state pair (used in tests / manual flows)."""
    _PENDING_CODES[state] = {"code": code, "error": error}


def pop_pending_code(state: str) -> dict | None:
    """Retrieve and remove a pending code by state token."""
    return _PENDING_CODES.pop(state, None)


def get_callback_url(hass_url: str) -> str:
    """Return the full redirect URI to register with Google / Microsoft."""
    return f"{hass_url.rstrip('/')}{CALLBACK_PATH}"

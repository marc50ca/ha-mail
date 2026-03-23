"""Gmail API client for Email Inbox integration."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

GMAIL_TOKEN_URI = "https://oauth2.googleapis.com/token"
GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1"


class GmailAuthError(Exception):
    """Raised when Gmail authentication fails."""


class GmailClient:
    """Client for Gmail API."""

    def __init__(
        self,
        hass: HomeAssistant,
        client_id: str,
        client_secret: str,
        token_data: dict,
        labels: list[str],
        max_emails: int,
    ) -> None:
        """Initialize Gmail client."""
        self._hass = hass
        self._client_id = client_id
        self._client_secret = client_secret
        self._token_data = token_data.copy()
        self._labels = labels
        self._max_emails = max_emails

    def get_token_data(self) -> dict:
        """Return current token data."""
        return self._token_data.copy()

    async def _async_refresh_token(self) -> None:
        """Refresh the access token using refresh_token."""
        import aiohttp
        refresh_token = self._token_data.get("refresh_token")
        if not refresh_token:
            raise GmailAuthError("No refresh token available. Please re-authenticate.")

        payload = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(GMAIL_TOKEN_URI, data=payload) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise GmailAuthError(f"Token refresh failed: {text}")
                data = await resp.json()
                self._token_data["access_token"] = data["access_token"]
                if "refresh_token" in data:
                    self._token_data["refresh_token"] = data["refresh_token"]
                _LOGGER.debug("Gmail token refreshed successfully")

    async def _async_api_request(self, url: str, params: dict | None = None) -> dict:
        """Make an authenticated API request, refreshing token if needed."""
        import aiohttp

        async def _do_request(token: str) -> tuple[int, Any]:
            headers = {"Authorization": f"Bearer {token}"}
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params) as resp:
                    return resp.status, await resp.json()

        status, data = await _do_request(self._token_data.get("access_token", ""))
        if status == 401:
            # Token expired — refresh and retry
            await self._async_refresh_token()
            status, data = await _do_request(self._token_data["access_token"])

        if status != 200:
            raise Exception(f"Gmail API error {status}: {data}")

        return data

    async def async_fetch_emails(self) -> dict:
        """Fetch emails from Gmail."""
        label_query = " OR ".join(f"label:{lbl}" for lbl in self._labels)
        query = f"is:unread ({label_query})"

        # Get unread count
        unread_data = await self._async_api_request(
            f"{GMAIL_API_BASE}/users/me/messages",
            params={"q": query, "maxResults": 1},
        )
        unread_count = unread_data.get("resultSizeEstimate", 0)

        # Get recent messages (unread + read)
        recent_data = await self._async_api_request(
            f"{GMAIL_API_BASE}/users/me/messages",
            params={
                "q": label_query,
                "maxResults": self._max_emails,
            },
        )
        messages = recent_data.get("messages", [])

        # Fetch full message details concurrently
        email_details = await asyncio.gather(
            *[self._async_fetch_message(msg["id"]) for msg in messages],
            return_exceptions=True,
        )

        emails = []
        for detail in email_details:
            if isinstance(detail, Exception):
                _LOGGER.warning("Failed to fetch message detail: %s", detail)
                continue
            emails.append(detail)

        return {
            "unread_count": unread_count,
            "emails": emails,
            "account": self._token_data.get("email", "Gmail"),
        }

    async def _async_fetch_message(self, message_id: str) -> dict:
        """Fetch a single message's metadata."""
        data = await self._async_api_request(
            f"{GMAIL_API_BASE}/users/me/messages/{message_id}",
            params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
        )

        headers = {h["name"]: h["value"] for h in data.get("payload", {}).get("headers", [])}
        label_ids = data.get("labelIds", [])
        is_unread = "UNREAD" in label_ids

        # Extract snippet (short preview)
        snippet = data.get("snippet", "")

        return {
            "id": message_id,
            "subject": headers.get("Subject", "(No Subject)"),
            "from": headers.get("From", "Unknown"),
            "date": headers.get("Date", ""),
            "snippet": snippet,
            "unread": is_unread,
            "labels": label_ids,
        }


    async def async_delete_email(self, message_id: str) -> None:
        """Move an email to Trash."""
        import aiohttp
        access_token = self._token_data.get("access_token", "")

        async def _do_trash(token: str) -> int:
            headers = {"Authorization": f"Bearer {token}"}
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{GMAIL_API_BASE}/users/me/messages/{message_id}/trash",
                    headers=headers,
                ) as resp:
                    return resp.status

        status = await _do_trash(access_token)
        if status == 401:
            await self._async_refresh_token()
            status = await _do_trash(self._token_data["access_token"])
        if status not in (200, 204):
            raise Exception(f"Failed to trash message {message_id}: HTTP {status}")
        _LOGGER.debug("Trashed Gmail message %s", message_id)

    async def async_mark_read(self, message_id: str) -> None:
        """Remove the UNREAD label from an email."""
        import aiohttp
        payload = {"removeLabelIds": ["UNREAD"]}

        async def _do_modify(token: str) -> int:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            import json
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{GMAIL_API_BASE}/users/me/messages/{message_id}/modify",
                    headers=headers,
                    data=json.dumps(payload),
                ) as resp:
                    return resp.status

        status = await _do_modify(self._token_data.get("access_token", ""))
        if status == 401:
            await self._async_refresh_token()
            status = await _do_modify(self._token_data["access_token"])
        if status not in (200, 204):
            raise Exception(f"Failed to mark message {message_id} read: HTTP {status}")


    async def async_fetch_message_body(self, message_id: str) -> dict:
        """Fetch the full body of a single Gmail message."""
        import base64 as _b64

        def _b64decode(s: str) -> bytes:
            """Decode Gmail base64url with correct padding (strip then re-add)."""
            s = s.rstrip("=")
            s += "=" * ((4 - len(s) % 4) % 4)
            return _b64.urlsafe_b64decode(s)

        data = await self._async_api_request(
            f"{GMAIL_API_BASE}/users/me/messages/{message_id}",
            params={"format": "full"},
        )

        headers = {
            h["name"]: h["value"]
            for h in data.get("payload", {}).get("headers", [])
        }

        body_html = ""
        body_text = ""
        # Cap decoded body at 256 KB to prevent huge JSON responses
        MAX_BYTES = 256 * 1024

        def _extract_parts(payload: dict) -> None:
            nonlocal body_html, body_text
            mime = payload.get("mimeType", "")
            body_data = payload.get("body", {}).get("data", "")

            if mime == "text/html" and body_data and not body_html:
                try:
                    raw = _b64decode(body_data)[:MAX_BYTES]
                    body_html = raw.decode("utf-8", errors="replace")
                except Exception as e:
                    _LOGGER.warning("Failed to decode HTML body: %s", e)
            elif mime == "text/plain" and body_data and not body_text:
                try:
                    raw = _b64decode(body_data)[:MAX_BYTES]
                    body_text = raw.decode("utf-8", errors="replace")
                except Exception as e:
                    _LOGGER.warning("Failed to decode text body: %s", e)

            for part in payload.get("parts", []):
                _extract_parts(part)

        _extract_parts(data.get("payload", {}))

        return {
            "id": message_id,
            "subject": headers.get("Subject", "(No Subject)"),
            "from": headers.get("From", "Unknown"),
            "to": headers.get("To", ""),
            "date": headers.get("Date", ""),
            "body_html": body_html,
            "body_text": body_text or data.get("snippet", ""),
        }

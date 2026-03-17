"""Microsoft 365 / Outlook client for Email Inbox integration."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common"
MICROSOFT_TOKEN_URI = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_API = "https://graph.microsoft.com/v1.0"


class MicrosoftAuthError(Exception):
    """Raised when Microsoft authentication fails."""


class MicrosoftClient:
    """Client for Microsoft Graph API (Outlook/M365)."""

    def __init__(
        self,
        hass: HomeAssistant,
        client_id: str,
        client_secret: str,
        token_data: dict,
        folders: list[str],
        max_emails: int,
    ) -> None:
        """Initialize Microsoft client."""
        self._hass = hass
        self._client_id = client_id
        self._client_secret = client_secret
        self._token_data = token_data.copy()
        self._folders = folders
        self._max_emails = max_emails
        self._folder_ids: dict[str, str] = {}

    def get_token_data(self) -> dict:
        """Return current token data."""
        return self._token_data.copy()

    async def _async_refresh_token(self) -> None:
        """Refresh the access token."""
        import aiohttp

        refresh_token = self._token_data.get("refresh_token")
        if not refresh_token:
            raise MicrosoftAuthError("No refresh token available. Please re-authenticate.")

        payload = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": "https://graph.microsoft.com/Mail.ReadWrite offline_access",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(MICROSOFT_TOKEN_URI, data=payload) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise MicrosoftAuthError(f"Token refresh failed: {text}")
                data = await resp.json()
                self._token_data["access_token"] = data["access_token"]
                if "refresh_token" in data:
                    self._token_data["refresh_token"] = data["refresh_token"]
                _LOGGER.debug("Microsoft token refreshed successfully")

    async def _async_api_request(
        self, url: str, params: dict | None = None
    ) -> dict:
        """Make an authenticated Graph API request."""
        import aiohttp

        async def _do_request(token: str) -> tuple[int, Any]:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params) as resp:
                    return resp.status, await resp.json()

        status, data = await _do_request(self._token_data.get("access_token", ""))
        if status == 401:
            await self._async_refresh_token()
            status, data = await _do_request(self._token_data["access_token"])

        if status not in (200, 201):
            raise Exception(f"Graph API error {status}: {data}")

        return data

    async def _async_resolve_folder_id(self, folder_name: str) -> str | None:
        """Resolve a folder name to its Graph API ID."""
        if folder_name in self._folder_ids:
            return self._folder_ids[folder_name]

        # Well-known folder names map directly
        well_known = {
            "inbox": "inbox",
            "sentitems": "sentItems",
            "deleteditems": "deletedItems",
            "drafts": "drafts",
            "junkemail": "junkemail",
        }
        normalized = folder_name.lower().replace(" ", "")
        if normalized in well_known:
            folder_id = well_known[normalized]
            self._folder_ids[folder_name] = folder_id
            return folder_id

        # Search by display name
        data = await self._async_api_request(
            f"{GRAPH_API}/me/mailFolders",
            params={"$filter": f"displayName eq '{folder_name}'"},
        )
        folders = data.get("value", [])
        if folders:
            folder_id = folders[0]["id"]
            self._folder_ids[folder_name] = folder_id
            return folder_id

        _LOGGER.warning("Could not resolve mail folder: %s", folder_name)
        return None

    async def async_fetch_emails(self) -> dict:
        """Fetch emails from Microsoft 365."""
        all_emails = []
        total_unread = 0

        for folder_name in self._folders:
            folder_id = await self._async_resolve_folder_id(folder_name)
            if not folder_id:
                continue

            # Get folder info (unread count)
            try:
                folder_data = await self._async_api_request(
                    f"{GRAPH_API}/me/mailFolders/{folder_id}",
                )
                total_unread += folder_data.get("unreadItemCount", 0)
            except Exception as err:
                _LOGGER.warning("Could not get folder info for %s: %s", folder_name, err)

            # Fetch messages
            try:
                messages_data = await self._async_api_request(
                    f"{GRAPH_API}/me/mailFolders/{folder_id}/messages",
                    params={
                        "$select": "id,subject,from,receivedDateTime,isRead,bodyPreview",
                        "$top": self._max_emails,
                        "$orderby": "receivedDateTime desc",
                    },
                )
                for msg in messages_data.get("value", []):
                    sender = msg.get("from", {}).get("emailAddress", {})
                    all_emails.append({
                        "id": msg.get("id", ""),
                        "subject": msg.get("subject", "(No Subject)"),
                        "from": f"{sender.get('name', '')} <{sender.get('address', '')}>".strip(),
                        "date": msg.get("receivedDateTime", ""),
                        "snippet": msg.get("bodyPreview", ""),
                        "unread": not msg.get("isRead", True),
                        "folder": folder_name,
                    })
            except Exception as err:
                _LOGGER.warning("Could not fetch messages from %s: %s", folder_name, err)

        # Sort by date descending and trim
        all_emails.sort(key=lambda e: e.get("date", ""), reverse=True)
        all_emails = all_emails[: self._max_emails]

        # Get account email
        try:
            me_data = await self._async_api_request(f"{GRAPH_API}/me", params={"$select": "mail,userPrincipalName"})
            account = me_data.get("mail") or me_data.get("userPrincipalName", "Microsoft 365")
        except Exception:
            account = self._token_data.get("email", "Microsoft 365")

        return {
            "unread_count": total_unread,
            "emails": all_emails,
            "account": account,
        }


    async def async_delete_email(self, message_id: str) -> None:
        """Permanently delete an email via the Graph API DELETE endpoint.

        Uses DELETE /me/messages/{id} which is simpler and more reliable than
        the /move endpoint. Requires Mail.ReadWrite delegated permission.
        If you see HTTP 403, your Azure app still has Mail.Read — update it to
        Mail.ReadWrite, grant admin consent, then remove and re-add the integration.
        """
        import aiohttp

        if not message_id or message_id == "undefined":
            raise ValueError(
                "message_id is missing or 'undefined'. "
                "Ensure sensor attributes contain the 'id' field and reload HA."
            )

        async def _do_delete(token: str) -> tuple[int, str]:
            headers = {"Authorization": f"Bearer {token}"}
            async with aiohttp.ClientSession() as session:
                async with session.delete(
                    f"{GRAPH_API}/me/messages/{message_id}",
                    headers=headers,
                ) as resp:
                    body = await resp.text()
                    return resp.status, body

        status, body = await _do_delete(self._token_data.get("access_token", ""))
        if status == 401:
            _LOGGER.debug("M365 delete: 401 received, refreshing token and retrying")
            await self._async_refresh_token()
            status, body = await _do_delete(self._token_data["access_token"])

        if status == 403:
            raise Exception(
                "HTTP 403 Forbidden — your Azure app token only has Mail.Read scope. "
                "In Azure Portal: API permissions → remove Mail.Read → add Mail.ReadWrite → "
                "Grant admin consent. Then remove and re-add the integration in HA."
            )
        if status not in (204, 200):
            raise Exception(
                f"Failed to delete message (HTTP {status}). Response: {body[:200]}"
            )
        _LOGGER.debug("Deleted M365 message %s", message_id)

    async def async_mark_read(self, message_id: str) -> None:
        """Mark an email as read."""
        import aiohttp
        import json

        async def _do_patch(token: str) -> int:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            async with aiohttp.ClientSession() as session:
                async with session.patch(
                    f"{GRAPH_API}/me/messages/{message_id}",
                    headers=headers,
                    data=json.dumps({"isRead": True}),
                ) as resp:
                    return resp.status

        status = await _do_patch(self._token_data.get("access_token", ""))
        if status == 401:
            await self._async_refresh_token()
            status = await _do_patch(self._token_data["access_token"])
        if status not in (200, 201):
            raise Exception(f"Failed to mark message {message_id} read: HTTP {status}")

    async def async_fetch_message_body(self, message_id: str) -> dict:
        """Fetch the full body of a single Microsoft 365 message."""
        data = await self._async_api_request(
            f"{GRAPH_API}/me/messages/{message_id}",
            params={
                "$select": "id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,isRead"
            },
        )

        sender = data.get("from", {}).get("emailAddress", {})
        to_list = [
            r.get("emailAddress", {}).get("address", "")
            for r in data.get("toRecipients", [])
        ]
        body_content = data.get("body", {})
        content_type = body_content.get("contentType", "text")
        body_value = body_content.get("content", data.get("bodyPreview", ""))

        return {
            "id": message_id,
            "subject": data.get("subject", "(No Subject)"),
            "from": f"{sender.get('name', '')} <{sender.get('address', '')}>".strip(),
            "to": ", ".join(to_list),
            "date": data.get("receivedDateTime", ""),
            "body_html": body_value if content_type == "html" else "",
            "body_text": body_value if content_type == "text" else data.get("bodyPreview", ""),
        }

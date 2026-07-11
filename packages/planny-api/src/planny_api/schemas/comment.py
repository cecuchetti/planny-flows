"""Pydantic models for Comment CRUD operations.

Field aliases enable camelCase JSON keys (matching the Node API) while
keeping Python identifiers in snake_case per project convention.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateCommentRequest(BaseModel):
    """Request body for ``POST /comments``.

    Expects ``{ "body": "...", "issueId": <int> }`` in JSON.
    """

    body: str = Field(min_length=1)
    issue_id: int = Field(alias="issueId")


class UpdateCommentRequest(BaseModel):
    """Request body for ``PUT /comments/{comment_id}``.

    Expects ``{ "body": "..." }`` in JSON.
    """

    body: str = Field(min_length=1)

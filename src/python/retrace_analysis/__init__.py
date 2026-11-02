"""retrace analysis sidecar.

A line-delimited JSON-RPC process. It knows nothing about MCP: the TypeScript
server translates MCP tool calls into these methods.
"""

from __future__ import annotations

VERSION = "1.0.0"
PROTOCOL = 1

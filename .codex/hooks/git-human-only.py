#!/usr/bin/env python3
"""Bloqueia operações Git de escrita reservadas ao humano pelo ADR-0006."""

from __future__ import annotations

import json
import re
import sys
from typing import Any


GIT_WRITE_COMMAND = re.compile(
    r"(?:^|\s|[;&|()])"
    r"(?:command\s+)?git\s+"
    r"(?:(?:-C|--git-dir|--work-tree|--namespace)\s+(?:\"[^\"]*\"|'[^']*'|\S+)\s+|"
    r"(?:--no-pager|--bare|--literal-pathspecs|--no-replace-objects|-\w+)\s+)*"
    r"(?:add|am|apply|bisect|branch|checkout|cherry-pick|clean|commit|config|fetch|gc|init|merge|mv|notes|pull|push|rebase|remote|reset|restore|rm|stash|submodule|tag|update-ref|worktree)\b",
    re.IGNORECASE,
)
GH_PR_WRITE_COMMAND = re.compile(
    r"(?:^|\s|[;&|()])(?:command\s+)?gh\s+pr\s+(?:create|merge)\b",
    re.IGNORECASE,
)


def read_command() -> str:
    try:
        payload: Any = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return ""

    if not isinstance(payload, dict):
        return ""

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return ""

    command = tool_input.get("command")
    return command if isinstance(command, str) else ""


def main() -> None:
    command = read_command()
    if not (
        GIT_WRITE_COMMAND.search(command) or GH_PR_WRITE_COMMAND.search(command)
    ):
        return

    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "Operações Git de escrita são exclusivas do humano (ADR-0006). "
                    "Deixe as mudanças no working tree e forneça o handoff."
                ),
            }
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()

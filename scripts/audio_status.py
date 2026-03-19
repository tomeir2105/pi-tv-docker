#!/usr/bin/env python3
"""Print the current PipeWire/WirePlumber audio setup and channel volumes."""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass


SECTION_PREFIXES = ("Audio", "Video", "Settings")
TREE_CHARS = " │├└─*"


@dataclass
class AudioNode:
    kind: str
    node_id: int
    name: str
    is_default: bool = False


def run_command(*args: str) -> str:
    completed = subprocess.run(args, check=True, capture_output=True, text=True)
    return completed.stdout


def parse_wpctl_status(status_text: str) -> tuple[list[AudioNode], dict[str, str]]:
    nodes: list[AudioNode] = []
    defaults: dict[str, str] = {}
    current_section: str | None = None
    current_group: str | None = None

    for raw_line in status_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if stripped in SECTION_PREFIXES:
            current_section = stripped
            current_group = None
            continue

        if current_section == "Audio":
            if stripped.startswith(("Devices:", "Sinks:", "Sources:", "Filters:", "Streams:")):
                current_group = stripped[:-1].lower()
                continue

            if current_group in {"devices", "sinks", "sources", "streams"}:
                cleaned = line.lstrip(TREE_CHARS)
                match = re.match(r"(\d+)\.\s+(.*?)(?:\s+\[vol:.*\])?$", cleaned)
                if match:
                    node_id = int(match.group(1))
                    name = match.group(2).rstrip()
                    nodes.append(
                        AudioNode(
                            kind=current_group,
                            node_id=node_id,
                            name=name.replace(" *", "").strip(),
                            is_default="*" in raw_line,
                        )
                    )
                continue

        if current_section == "Settings":
            default_match = re.match(r"\d+\.\s+(.+?)\s{2,}(.+)", stripped)
            if default_match:
                defaults[default_match.group(1).strip()] = default_match.group(2).strip()

    return nodes, defaults


def parse_inspect(text: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if " = " not in line:
            continue
        key, value = line.split(" = ", 1)
        props[key.lstrip("* ").strip()] = value.strip().strip('"')
    return props


def get_volume(node_ref: str) -> str:
    completed = subprocess.run(
        ["wpctl", "get-volume", node_ref],
        capture_output=True,
        text=True,
        check=False,
    )
    output = (completed.stdout or completed.stderr).strip()
    return output if output else "Unavailable"


def print_node(node: AudioNode) -> None:
    inspect = parse_inspect(run_command("wpctl", "inspect", str(node.node_id)))
    volume = get_volume(str(node.node_id))
    default_marker = " (default)" if node.is_default else ""

    print(f"{node.kind[:-1].title()} {node.node_id}: {node.name}{default_marker}")
    print(f"  Volume: {volume}")

    wanted_keys = [
        "node.description",
        "node.name",
        "node.nick",
        "media.class",
        "device.profile.description",
        "audio.channels",
        "audio.position",
        "application.name",
        "application.process.binary",
    ]
    for key in wanted_keys:
        value = inspect.get(key)
        if value:
            print(f"  {key}: {value}")
    print()


def main() -> int:
    try:
        status_text = run_command("wpctl", "status")
        nodes, defaults = parse_wpctl_status(status_text)
    except subprocess.CalledProcessError as exc:
        print(exc.stderr or str(exc), file=sys.stderr)
        return exc.returncode or 1

    print("Audio Setup")
    print("===========")
    print(get_volume("@DEFAULT_AUDIO_SINK@").replace("Volume:", "Default sink volume:").strip())
    print(get_volume("@DEFAULT_AUDIO_SOURCE@").replace("Volume:", "Default source volume:").strip())
    if defaults:
        print()
        print("Configured defaults:")
        for key, value in defaults.items():
            print(f"  {key}: {value}")
    print()

    audio_nodes = [node for node in nodes if node.kind in {"devices", "sinks", "sources", "streams"}]
    grouped = {
        "devices": [node for node in audio_nodes if node.kind == "devices"],
        "sinks": [node for node in audio_nodes if node.kind == "sinks"],
        "sources": [node for node in audio_nodes if node.kind == "sources"],
        "streams": [node for node in audio_nodes if node.kind == "streams"],
    }

    for group_name, group_nodes in grouped.items():
        print(group_name.title())
        print("-" * len(group_name))
        if not group_nodes:
            print("  None\n")
            continue
        for node in group_nodes:
            print_node(node)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

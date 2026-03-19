#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 12
DEFAULT_USER_AGENT = "PI-TV-Stream-Debugger/1.0"


@dataclass
class ProbeResult:
    name: str
    url: str
    kind: str
    ok: bool
    status: int | None = None
    latency_ms: int | None = None
    content_type: str | None = None
    final_url: str | None = None
    detail: str | None = None
    playlist_target: str | None = None
    segment_target: str | None = None


def load_env(env_path: Path) -> dict[str, str]:
  values: dict[str, str] = {}
  for raw_line in env_path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip()
  return values


def iter_channel_urls(env: dict[str, str]) -> Iterable[tuple[str, str, str]]:
  for channel_id in ("11", "12", "13"):
    primary_key = f"CHANNEL{channel_id}_URL"
    primary_url = env.get(primary_key, "").strip()
    if primary_url:
      yield (f"Channel {channel_id}", "primary", primary_url)

    fallback_key = f"CHANNEL{channel_id}_FALLBACK_URLS"
    fallback_urls = [entry.strip() for entry in env.get(fallback_key, "").split(",") if entry.strip()]
    for index, fallback_url in enumerate(fallback_urls, start=1):
      yield (f"Channel {channel_id}", f"fallback-{index}", fallback_url)


def fetch(url: str, timeout_seconds: int, byte_limit: int = 8192) -> tuple[bytes, dict[str, str], str, int, int]:
  request = Request(url, headers={
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "*/*",
    "Cache-Control": "no-cache",
  })

  started_at = time.perf_counter()
  with urlopen(request, timeout=timeout_seconds) as response:
    payload = response.read(byte_limit)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    headers = {key.lower(): value for key, value in response.headers.items()}
    status = getattr(response, "status", None) or response.getcode()
    final_url = response.geturl()
    return payload, headers, final_url, status, elapsed_ms


def parse_playlist_entries(text: str) -> list[str]:
  return [
    line.strip()
    for line in text.splitlines()
    if line.strip() and not line.lstrip().startswith("#")
  ]


def probe_hls(url: str, timeout_seconds: int) -> ProbeResult:
  try:
    body, headers, final_url, status, latency_ms = fetch(url, timeout_seconds)
  except HTTPError as error:
    return ProbeResult(name="", url=url, kind="hls", ok=False, status=error.code, detail=f"HTTP {error.code}: {error.reason}")
  except URLError as error:
    return ProbeResult(name="", url=url, kind="hls", ok=False, detail=f"URL error: {error.reason}")
  except Exception as error:  # pragma: no cover - defensive
    return ProbeResult(name="", url=url, kind="hls", ok=False, detail=f"Unexpected error: {error}")

  text = body.decode("utf-8", errors="replace")
  if "#EXTM3U" not in text:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      detail="Response did not look like an HLS playlist",
    )

  entries = parse_playlist_entries(text)
  if not entries:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      detail="Playlist loaded but had no playable entries",
    )

  playlist_target = urljoin(final_url, entries[0])
  try:
    nested_body, nested_headers, nested_final_url, _nested_status, _nested_latency = fetch(playlist_target, timeout_seconds)
  except HTTPError as error:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      playlist_target=playlist_target,
      detail=f"Playlist loaded, but nested target failed with HTTP {error.code}",
    )
  except URLError as error:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      playlist_target=playlist_target,
      detail=f"Playlist loaded, but nested target failed: {error.reason}",
    )

  nested_text = nested_body.decode("utf-8", errors="replace")
  nested_entries = parse_playlist_entries(nested_text)
  if not nested_entries:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=True,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      playlist_target=nested_final_url,
      detail="Loaded playlist and nested playlist, but no media segment was listed yet",
    )

  segment_target = urljoin(nested_final_url, nested_entries[0])
  try:
    _segment_body, segment_headers, _segment_final_url, _segment_status, _segment_latency = fetch(segment_target, timeout_seconds, byte_limit=2048)
  except HTTPError as error:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      playlist_target=nested_final_url,
      segment_target=segment_target,
      detail=f"Playlists loaded, but first segment failed with HTTP {error.code}",
    )
  except URLError as error:
    return ProbeResult(
      name="",
      url=url,
      kind="hls",
      ok=False,
      status=status,
      latency_ms=latency_ms,
      content_type=headers.get("content-type"),
      final_url=final_url,
      playlist_target=nested_final_url,
      segment_target=segment_target,
      detail=f"Playlists loaded, but first segment failed: {error.reason}",
    )

  return ProbeResult(
    name="",
    url=url,
    kind="hls",
    ok=True,
    status=status,
    latency_ms=latency_ms,
    content_type=headers.get("content-type"),
    final_url=final_url,
    playlist_target=nested_final_url,
    segment_target=segment_target,
    detail=f"Playlist chain reachable; segment content-type={segment_headers.get('content-type', 'unknown')}",
  )


def probe_url(name: str, variant: str, url: str, timeout_seconds: int) -> ProbeResult:
  result = probe_hls(url, timeout_seconds)
  result.name = f"{name} ({variant})"
  return result


def print_human(results: list[ProbeResult]) -> None:
  for result in results:
    status_text = "OK" if result.ok else "FAIL"
    print(f"[{status_text}] {result.name}")
    print(f"  URL: {result.url}")
    if result.status is not None:
      print(f"  HTTP: {result.status}")
    if result.latency_ms is not None:
      print(f"  Latency: {result.latency_ms} ms")
    if result.final_url:
      print(f"  Final URL: {result.final_url}")
    if result.playlist_target:
      print(f"  Playlist target: {result.playlist_target}")
    if result.segment_target:
      print(f"  Segment target: {result.segment_target}")
    if result.content_type:
      print(f"  Content-Type: {result.content_type}")
    if result.detail:
      print(f"  Detail: {result.detail}")
    print()


def main() -> int:
  parser = argparse.ArgumentParser(description="Probe configured TV stream URLs outside the browser.")
  parser.add_argument("--env-file", default=".env", help="Path to the env file to read channel URLs from")
  parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Per-request timeout in seconds")
  parser.add_argument("--json", action="store_true", help="Print JSON instead of human-readable output")
  args = parser.parse_args()

  env_path = Path(args.env_file)
  if not env_path.exists():
    print(f"Env file not found: {env_path}", file=sys.stderr)
    return 2

  env = load_env(env_path)
  targets = list(iter_channel_urls(env))
  if not targets:
    print("No channel URLs found in the env file.", file=sys.stderr)
    return 2

  results = [probe_url(name, variant, url, args.timeout) for name, variant, url in targets]

  if args.json:
    print(json.dumps([asdict(result) for result in results], indent=2))
  else:
    print_human(results)

  return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
  raise SystemExit(main())

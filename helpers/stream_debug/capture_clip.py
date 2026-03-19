#!/usr/bin/env python3

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def load_env(env_path: Path) -> dict[str, str]:
  values: dict[str, str] = {}
  for raw_line in env_path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip()
  return values


def resolve_channel_url(env: dict[str, str], channel: str) -> tuple[str, str]:
  if channel.startswith("http://") or channel.startswith("https://"):
    return "custom", channel

  channel_id = channel.strip()
  primary_key = f"CHANNEL{channel_id}_URL"
  url = env.get(primary_key, "").strip()
  if url:
    return channel_id, url

  raise SystemExit(f"No URL configured for channel {channel_id}")


def ensure_binary(name: str) -> str:
  binary = shutil.which(name)
  if not binary:
    raise SystemExit(f"Required binary not found: {name}")
  return binary


def main() -> int:
  parser = argparse.ArgumentParser(description="Capture a short MP4 sample clip from a configured TV stream.")
  parser.add_argument("--env-file", default=".env", help="Path to env file")
  parser.add_argument("--channel", default="11", help="Channel number from .env or a full HLS URL")
  parser.add_argument("--seconds", type=int, default=12, help="Clip duration in seconds")
  parser.add_argument(
    "--output",
    default="helpers/stream_debug/output",
    help="Directory where the MP4 clip should be written",
  )
  args = parser.parse_args()

  ffmpeg_bin = ensure_binary("ffmpeg")
  ffprobe_bin = ensure_binary("ffprobe")

  env = load_env(Path(args.env_file))
  channel_label, source_url = resolve_channel_url(env, args.channel)

  output_dir = Path(args.output)
  output_dir.mkdir(parents=True, exist_ok=True)
  output_file = output_dir / f"channel-{channel_label}-sample-{args.seconds}s.mp4"

  ffmpeg_cmd = [
    ffmpeg_bin,
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    source_url,
    "-t",
    str(max(1, args.seconds)),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    str(output_file),
  ]

  subprocess.run(ffmpeg_cmd, check=True)

  ffprobe_cmd = [
    ffprobe_bin,
    "-v",
    "error",
    "-show_entries",
    "stream=index,codec_type,codec_name",
    "-of",
    "compact=p=0:nk=1",
    str(output_file),
  ]
  probe = subprocess.run(ffprobe_cmd, check=True, capture_output=True, text=True)

  print(f"Created: {output_file}")
  print("Streams:")
  print(probe.stdout.strip() or "(none)")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

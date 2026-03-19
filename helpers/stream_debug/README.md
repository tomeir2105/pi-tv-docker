# Stream Debug Helpers

This folder contains small Python tools for testing the TV stream URLs outside the browser UI.

## Quick start

From the repo root:

```bash
python3 helpers/stream_debug/check_streams.py
```

That script:

- reads channel URLs from `.env`
- tests each primary stream and each fallback URL
- checks that the top-level HLS playlist loads
- follows the first nested playlist entry
- tries to fetch the first media segment

If a stream fails here too, the issue is likely the stream URL, token, network path, or upstream provider.
If the helper succeeds but the TV still shows no stream, the problem is more likely inside Chromium, HLS.js, autoplay, or audio/video output.

## Useful commands

Human-readable output:

```bash
python3 helpers/stream_debug/check_streams.py
```

JSON output:

```bash
python3 helpers/stream_debug/check_streams.py --json
```

Use a different env file:

```bash
python3 helpers/stream_debug/check_streams.py --env-file .env.example
```

Increase timeout:

```bash
python3 helpers/stream_debug/check_streams.py --timeout 20
```

## Capture A Downloadable Sample

Create a short MP4 clip from a configured channel:

```bash
python3 helpers/stream_debug/capture_clip.py --channel 11 --seconds 12
```

The output file will be written under:

```bash
helpers/stream_debug/output/
```

You can then inspect the resulting file with `ffprobe` or download and play it elsewhere to verify whether the stream itself contains audio.

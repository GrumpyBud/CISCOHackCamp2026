#!/usr/bin/env python3
"""Read a Reflex Console serial export and write the dashboard JSON format.

Usage: python3 export_badge.py --port /dev/ttyUSB0 --output reflex-export.json
Install once with: python3 -m pip install pyserial
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

PREFIX = "REFLEX_EXPORT "


def build_export(frames: list[dict]) -> dict:
    begin = next((frame for frame in frames if frame.get("type") == "begin"), None)
    end = next((frame for frame in frames if frame.get("type") == "end"), None)
    sessions = [frame for frame in frames if frame.get("type") == "session"]
    if not begin or not end:
        raise ValueError("Badge did not return complete begin/end export frames")
    if begin.get("protocol") != 1 or end.get("protocol") != 1:
        raise ValueError("Unsupported Reflex export protocol")
    sessions.sort(key=lambda session: session.get("sequence", -1))
    if len(sessions) != begin.get("session_count") or len(sessions) != end.get("session_count"):
        raise ValueError("Session count does not match export framing")
    sequences = [session.get("sequence") for session in sessions]
    start, finish = (sequences[0], sequences[-1]) if sequences else (0, 0)
    if (begin.get("session_sequence_start"), begin.get("session_sequence_end"), end.get("session_sequence_start"), end.get("session_sequence_end")) != (start, finish, start, finish):
        raise ValueError("Session sequence range does not match export framing")
    return {"format": "reflex-console-export", "protocol": 1, "begin": begin, "sessions": sessions, "end": end}


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Reflex Console sessions over USB serial")
    parser.add_argument("--port", required=True, help="Serial device, e.g. COM3 or /dev/ttyUSB0")
    parser.add_argument("--output", type=Path, default=Path("reflex-export.json"))
    parser.add_argument("--timeout", type=float, default=15, help="Seconds to wait for the end frame")
    args = parser.parse_args()
    try:
        import serial  # type: ignore[import-not-found]
    except ImportError:
        print("pyserial is required: python3 -m pip install pyserial", file=sys.stderr)
        return 2
    frames: list[dict] = []
    deadline = time.monotonic() + args.timeout
    with serial.Serial(args.port, 115200, timeout=0.25) as badge:
        badge.reset_input_buffer()
        badge.write(b"REFLEX_EXPORT_V1\n")
        badge.flush()
        while time.monotonic() < deadline:
            line = badge.readline().decode("utf-8", errors="replace").strip()
            if not line.startswith(PREFIX):
                continue
            try:
                frame = json.loads(line[len(PREFIX):])
            except json.JSONDecodeError as error:
                raise ValueError(f"Malformed badge export frame: {error}") from error
            frames.append(frame)
            if frame.get("type") == "end":
                payload = build_export(frames)
                args.output.write_text(json.dumps(payload, indent=2) + "\\n", encoding="utf-8")
                print(f"Wrote {len(payload['sessions'])} sessions to {args.output}")
                return 0
    print("Timed out waiting for a complete export", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""new-entry.py - Create a standardized Omarchy log entry in Reality Sculptor vault.

Usage:
    python3 new-entry.py "Title of the Incident or Feature" [--tags tag1,tag2] [--status resolved]
"""

import argparse
import datetime
import os
import re
import socket
import subprocess
import sys
from pathlib import Path


def get_system_telemetry() -> dict:
    """Gathers current host, kernel, Hyprland, and GPU telemetry."""
    hostname = socket.gethostname()

    kernel = "unknown"
    try:
        kernel = subprocess.check_output(["uname", "-r"], text=True).strip()
    except Exception:
        pass

    hypr_info = "Hyprland"
    try:
        out = subprocess.check_output(["hyprctl", "version"], text=True)
        m_h = re.search(r"Hyprland (\S+)", out)
        m_a = re.search(r"Aquamarine: built against \S+, system has (\S+)", out)
        h_ver = m_h.group(1) if m_h else ""
        a_ver = m_a.group(1) if m_a else ""
        if h_ver and a_ver:
            hypr_info = f"Hyprland {h_ver} (Aquamarine {a_ver})"
        elif h_ver:
            hypr_info = f"Hyprland {h_ver}"
    except Exception:
        pass

    gpu_info = ""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=gpu_name,driver_version", "--format=csv,noheader"],
            text=True,
        ).strip()
        if out:
            parts = [p.strip() for p in out.split(",")]
            if len(parts) >= 2:
                gpu_info = f"{parts[0]} (driver {parts[1]})"
            else:
                gpu_info = out
    except Exception:
        pass

    return {
        "hostname": hostname,
        "kernel": kernel,
        "hyprland": hypr_info,
        "gpu": gpu_info,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scaffold a new Omarchy log entry in Obsidian vault"
    )
    parser.add_argument("title", help="Descriptive title for the entry in Title Case")
    parser.add_argument(
        "--tags",
        default="omarchy,troubleshooting",
        help="Comma-separated list of tags (default: omarchy,troubleshooting)",
    )
    parser.add_argument(
        "--status",
        default="resolved",
        choices=["resolved", "in-progress", "workaround-implemented", "monitoring"],
        help="Current status of the incident/feature (default: resolved)",
    )
    parser.add_argument(
        "--client",
        default="",
        help="Client or streaming session details (e.g. Sunshine, Moonlight, Physical DP-1)",
    )
    parser.add_argument(
        "--vault-dir",
        default="~/Work/Reality Sculptor/Omarchy log",
        help="Path to the Omarchy log vault directory",
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite file if it already exists"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print template to stdout without saving"
    )

    args = parser.parse_args()

    today = datetime.date.today().strftime("%Y-%m-%d")
    sanitized_title = args.title.replace("/", "-").replace(":", " -")
    filename = f"{today} - {sanitized_title}.md"

    vault_path = Path(os.path.expanduser(args.vault_dir))
    target_file = vault_path / filename

    telemetry = get_system_telemetry()
    host_parts = [f"Omarchy Linux (`{telemetry['hostname']}`)"]
    if telemetry["hyprland"]:
        host_parts.append(telemetry["hyprland"])
    if telemetry["gpu"]:
        host_parts.append(telemetry["gpu"])
    host_line = ", ".join(host_parts)

    status_formatted = args.status.replace("-", " ").title()

    tag_list = [f"  - {t.strip()}" for t in args.tags.split(",") if t.strip()]
    yaml_tags = "\n".join(tag_list)

    client_line = f"**Client / Session**: {args.client}  \n" if args.client else ""

    content = f"""---
date: {today}
tags:
{yaml_tags}
status: {args.status}
---

# {sanitized_title}

**Date**: {today}  
**Host**: {host_line}  
{client_line}**Status**: {status_formatted}  

---

## 1. Problem Description / Goal

<!-- Detail observable symptoms, affected applications/services, user impact, or implementation objectives. -->

---

## 2. Root Cause Analysis / Technical Context

<!-- Include verbatim error logs (journalctl, dmesg, crash dumps), command outputs, or architectural breakdowns. -->

---

## 3. Solution / Implementation Details

<!-- Step-by-step description of fixes, configuration changes, or code modifications. Use clickable file:// links for all file references. -->

---

## 4. Verification & Testing Results

<!-- Concrete validation steps, terminal outputs, in-game/desktop verification, and stability checks. -->

---

## 5. Upstream References & Context (Optional)

<!-- Links to related GitHub issues, upstream PRs, bug trackers, or documentation. -->
"""

    if args.dry_run:
        print(content)
        return

    vault_path.mkdir(parents=True, exist_ok=True)
    if target_file.exists() and not args.force:
        print(f"Error: Target file already exists: {target_file}", file=sys.stderr)
        print("Use --force to overwrite.", file=sys.stderr)
        sys.exit(1)

    target_file.write_text(content, encoding="utf-8")
    print(f"Created Omarchy log entry: [{target_file.name}](file://{target_file.resolve()})")


if __name__ == "__main__":
    main()

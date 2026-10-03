---
name: omarchy-log
description: >
  Document, structure, and maintain systematic incident, debugging, and system configuration
  logs in the user's Obsidian vault at ~/Work/Reality Sculptor/Omarchy log/. Use whenever
  investigating, resolving, or configuring Omarchy OS, Arch Linux system services, Hyprland,
  GPU drivers, Sunshine/Moonlight streaming, Proton/Wine gaming, audio (PipeWire), or peripherals,
  or whenever asked to "update omarchy log", "add an entry to the omarchy log", or log system work.
---

# omarchy-log

Record systematic, evidence-based engineering notes for system configurations, debugging investigations, and incident resolutions on the user's Omarchy Linux machine.

All notes are stored in the user's Obsidian vault at:
```text
~/Work/Reality Sculptor/Omarchy log/
```

---

## 1. When This Skill Should Be Used

Activate this skill whenever:
* The user asks to **"update the omarchy log"**, **"add an entry to the omarchy log"**, or document system troubleshooting.
* Resolving complex Linux system incidents (e.g. GPU MMU page faults, compositor freezes, Wayland screencopy drops, network/routing conflicts, audio routing).
* Implementing custom user-space integrations on Omarchy (e.g. agent wrappers, Sunshine/Moonlight prep scripts, keybinding/input remappings).
* Changing hardware or driver configurations (e.g. NVIDIA drivers, VKD3D-Proton workarounds, display DPMS/monitor rules).

---

## 2. Directory & File Naming Conventions

### Vault Path
All entries reside in:
```text
/home/dan/Work/Reality Sculptor/Omarchy log/
```

### File Naming Format
Format:
```text
YYYY-MM-DD - <Concise Descriptive Title in Title Case>.md
```

Examples:
* `2026-09-28 - Sunshine Lockscreen Unlock Freeze and Wayland Screencopy DRM Modeset Invalidation.md`
* `2026-09-27 - Setting Antigravity (agy) as Default System Coding Agent with Autonomous Omarchy Integration.md`
* `2026-10-03 - Clair Obscur UE5 Freeze on Journal Interaction and VKD3D Host-Visible VRAM MMU Fault.md`

Avoid generic titles like `Fix crash.md` or `Game issues.md`. State the core technology, symptom, and root mechanism.

---

## 3. Required Note Schema

Every log entry must follow this standardized schema:

```markdown
---
date: YYYY-MM-DD
tags:
  - omarchy
  - <topic1>
  - <topic2>
status: resolved | in-progress | workaround-implemented | monitoring
---

# <Descriptive Title in Title Case>

**Date**: YYYY-MM-DD  
**Host**: Omarchy Linux (`<hostname>`), Hyprland <version> (Aquamarine <version>), <GPU> (driver <version>)  
**Client / Session**: <Client details, e.g. Sunshine 0.23.2 to LG C2 via Moonlight, or Physical DP-1> *(optional if purely local)*  
**Status**: Resolved | Workaround Implemented | In Progress  

---

## 1. Problem Description / Goal

* Clear statement of the problem, observable symptoms, affected user workflows, or engineering goals.
* Specify whether audio/video/input was affected.

---

## 2. Diagnostics & Root Cause Analysis

* Step-by-step diagnostic breakdown.
* **Verbatim log traces**: Quote exact snippets from `journalctl`, `dmesg`, kernel logs, or crash dumps (e.g. `Xid 31`, `VK_ERROR_DEVICE_LOST`, `SIGSEGV`).
* Trace the chain of causality through the relevant software layers (Kernel -> Driver -> Wayland/Hyprland -> Wine/Proton -> App).

---

## 3. Solution / Implementation Details

* Detail the exact changes made, config files created/edited, or packages adjusted.
* **Clickable file links**: Use GitHub-style `file:///` markdown links for every modified file or script (e.g., [`~/.config/protonfixes/localfixes/1903340.py`](file:///home/dan/.config/protonfixes/localfixes/1903340.py)).
* Highlight how the fix complies with Omarchy rules (e.g., never modifying `/usr/share/omarchy/`, keeping user overrides in `~/.config/` or `~/.local/`).

---

## 4. Verification & Testing Results

* Provide concrete evidence that the fix worked.
* Note any performance tradeoffs, VRAM/RAM utilization, or edge cases verified.
* Confirm non-regression of related components (e.g. save game integrity, stock settings for other titles).

---

## 5. Upstream References & Context (Optional)

* Links to GitHub issues, PRs, driver release notes, bug reports, or upstream discussions.
```

---

## 4. Automated Scaffolding Script

A helper script is provided with this skill to automatically gather live system telemetry and generate the note template:

```bash
# Generate a new log entry file with live system telemetry
python3 /home/dan/code/homostellaris/dotfiles/agents/skills/omarchy-log/scripts/new-entry.py "Descriptive Title" --tags omarchy,gaming,gpu --status resolved

# Optional flags:
#   --client "Sunshine / Moonlight webOS"
#   --dry-run        (preview without saving)
#   --force          (overwrite existing file)
```

The script automatically detects:
* Current hostname (`hostname`)
* Hyprland & Aquamarine versions (`hyprctl version`)
* Kernel version (`uname -r`)
* NVIDIA GPU model and driver version (`nvidia-smi`)

After scaffolding, populate each section with the specific technical details of the session.

---

## 5. Core Standards for Agents

1. **Be Evidence-Driven**: Always include actual log snippets and outputs rather than hand-wavy descriptions.
2. **Path Integrity**: Always link files using the `[filename](file:///absolute/path)` syntax.
3. **Respect Omarchy Principles**:
   * Never advise modifying `/usr/share/omarchy/` directly (it gets overwritten on `omarchy update`).
   * Keep user configurations in `~/.config/`, `~/.local/bin/`, or standard XDG paths.
4. **Idempotency & Reversibility**: Note whether a workaround is temporary pending an upstream driver/package update, and document how to revert it cleanly.

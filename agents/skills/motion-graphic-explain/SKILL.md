---
name: motion-graphic-explain
description: >
  Generate 60fps kinetic motion graphic explainer videos for Pull Requests, git diffs, and
  system architecture using Psychopomp, featuring 3D wireframe orbs, reactive signal wires,
  procedural explosions, rewind transitions, synchronized voiceover narration, and animated stepped code diffs.
---

# Motion Graphic Explain

> [!NOTE]
> **Attribution & Credits**: Conceived, designed, and pioneered by **[Kit Langton](https://github.com/kitlangton)** ([@kitlangton on X](https://x.com/kitlangton)).
> Powered by Kit Langton's open-source Rust motion graphics engine **[Psychopomp](https://github.com/kitlangton/psychopomp)**.
> Based on Kit's viral PR explainer demonstration ([X announcement](https://x.com/kitlangton/status/2106623769146233112) and [Psychopomp reveal](https://x.com/kitlangton/status/2106757008305332527)).

Generate high-fidelity, deterministic 60fps motion graphic walkthrough videos for Pull Requests, protocols, and architectural changes using Kit Langton's **Psychopomp** engine (`~/Work/psychopomp`).

## Overview & Visual Language

A PR explainer reel turns dry PR diffs and architecture reviews into a clear, kinetic story:
1. **Behavior Before Code**: Show what is broken first, then replay the same scene with the fix resolving cleanly, then zoom into the minimal code diff.
2. **Kinetic System Diagrams**: 3D wireframe orbs (services, servers, nodes), cards (clients, config, registries), and reactive glowing wires with traveling signal dots and cooling light trails.
3. **Procedural Physical Metaphors**: Raymarched volumetric combustion on process termination (`SIGKILL`), screen-space pressure shockwaves, sparks with physical drag, and visual rewinds (`◀◀ rewind`).
4. **Synchronized Spoken Narration**: Spoken narration (ElevenLabs, Fish Audio, or Linux Edge-TTS) aligned to millisecond word timestamps via Whisper. Every visual beat (send, hit, shatter, callout, mark) anchors to a spoken phrase.
5. **Stepped Code Diffs**: Seamless camera project-zooms from 3D stage cards directly into 2D editor code blocks with syntax highlighting, animated line additions/removals, and pinned callouts.

---

## When to Use This Skill

Use this skill when:
- Summarizing a non-trivial Pull Request, feature branch, or bug fix.
- Presenting a visual architecture explainer for team review or public demo.
- Integrating with the Agentic Build Orchestrator (`build <spec-id>`) to attach motion graphic explainers to newly created PRs.
- Publishing explainer videos to your private Tailscale network via the `share` skill.

---

## Core Workflow

The Psychopomp workspace is located at:
```bash
cd ~/Work/psychopomp
```

### Step 1: Fact Extraction
Read the actual PR description and diff:
```bash
gh pr view <number> --json title,body
gh pr diff <number>
```
Extract three concise statements:
- **Broken Behavior**: What failed, collided, or timed out.
- **Fixed Behavior**: How the system reacts now.
- **The Change**: The minimal lines of code (at most 76 columns × 14 rows).

### Step 2: Narration Script
Write the script as `scenes/<name>/narration/script.json`:
```json
{
  "engine": "elevenlabs",
  "model": "eleven_v4",
  "voice": "<voice_id>",
  "clips": [
    { "id": "intro", "text": "[warm, conversational voice] High level overview..." },
    { "id": "fix-before", "text": "First: what went wrong. The client sends a request..." },
    { "id": "fix-after", "text": "[confident] With the fix, the client checks the version..." },
    { "id": "fix-code", "text": "The diff deletes two lines in the client handler." }
  ]
}
```
*(For local zero-cost drafts without API keys, run with `--draft` to use local high-quality TTS).*

### Step 3: Audio Synthesis & Word Alignment
Generate speech, normalize loudness to -16 LUFS, and extract Whisper word-level timestamps:
```bash
# Draft (zero API keys required, uses Edge-TTS on Linux)
bun scripts/narrate.ts scenes/<name>/narration/script.json --draft

# Production (with ElevenLabs or Fish Audio)
ELEVENLABS_API_KEY=... bun scripts/narrate.ts scenes/<name>/narration/script.json
```

### Step 4: Scene Program Authoring
Author the scene in `scenes/<name>/src/`:
- Use `StageActor` for entities (`settle_in`, `connect`, `send`, `hit`, `combustion`, `to`, `glide`).
- Use `narration.clip("<id>")?.place(&mut scene, start)` and anchor visual beats with `spoken.at("<phrase>")`.
- Use `Diff` of `keep`, `add(step)`, and `remove(step)` lines for code diffs.
- Use `ReelPlan` with `ReelTransitionStyle::Zoom` to transition from stage cards into code.

Emit the reel JSON:
```bash
cargo run -p psychopomp-<name>
```

### Step 5: Validate & Inspect
```bash
cargo run --release -- plan validate scenes/<name>/<name>.reel.json
cargo run --release -- plan inspect scenes/<name>/<name>.reel.json
```

### Step 6: Render 1080p60 MP4
Render using Vulkan/wgpu and FFmpeg on the NVIDIA RTX 4070:
```bash
cargo run --release -- plan render \
  scenes/<name>/<name>.reel.json \
  output/<name>.mp4 \
  --theme opencode
```

### Step 7: Share & Deliver
Share the resulting video on your Tailscale network using the `share` skill:
```bash
share --file output/<name>.mp4 --title "PR Explainer"
```
Or attach it to the GitHub PR.

---

## Attribution & References

- **Original Author & Pioneer**: [Kit Langton](https://github.com/kitlangton) ([@kitlangton on X](https://x.com/kitlangton))
- **Core Engine Repository**: [kitlangton/psychopomp](https://github.com/kitlangton/psychopomp)
- **Primary Demonstrations**:
  - [OpenCode Motion Graphic PR Explainers Tweet](https://x.com/kitlangton/status/2106623769146233112)
  - [Psychopomp Motion Graphics Library Tweet](https://x.com/kitlangton/status/2106756807813394752)
  - [Reply to Minifield Labs Tweet](https://x.com/kitlangton/status/2106757008305332527)
- **Design Philosophy**: Based on Kit Langton's motion craft guidelines in `explainer-motion` and storytelling rules in `STORY.md`.

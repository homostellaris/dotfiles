# Port Reservations & Allocation Registry

This document defines the reserved port ranges and conventions for all projects in the Homo Stellaris ecosystem.
Port assignments prevent port collisions across concurrent local checkouts, parallel worktree sessions, and automated AI agent builds.

---

## 1. Project Port Blocks

Each project is assigned a dedicated 100-port block:

| Project | Port Block | Main Checkout Default | Dynamic Worktree Pool |
| :--- | :--- | :--- | :--- |
| **StarFocus** | **`6600 – 6699`** | **`6600`** | `6605 – 6625` |
| **Banerry** | **`6700 – 6799`** | **`6700`** | `6705 – 6725` |
| **Reserved / Next** | **`6800 – 6899`** | **`6800`** | `6805 – 6825` |

---

## 2. Port Allocation Rules

1. **Main Checkout**:
   - The primary checkout of each repository defaults to the base port (`6600` for StarFocus, `6700` for Banerry).
   - The base port is defined in `.env.local` (`PORT=6600` for StarFocus, `PORT=6700` for Banerry).
   - In `package.json`, Next.js automatically picks up `PORT` from `.env.local`:
     ```json
     "dev": "bun --bun next dev --webpack"
     ```

2. **Dynamic Worktree Sessions**:
   - Every nested worktree under `.worktrees/<name>` is assigned a dedicated, sticky port from the dynamic pool (`6605..6625` for StarFocus).
   - The port is stored in `.worktrees/<name>/.env.local` as `PORT=<allocated_port>`.
   - Managed automatically by `worktree.ts` (`worktree add <branch>`).

3. **Central Port Registry**:
   - Active worktree allocations are recorded in `~/.local/share/agent-builds/ports.json`.
   - Read by `share-server.mjs` to surface live dev server links on the Tailscale web portal (`https://omarchy.tail29c7da.ts.net/starfocus/`).

---

## 3. Dexie Cloud Origin Whitelisting

Dexie Cloud verifies all connecting origins. To avoid runtime errors, the entire initial pool (`6600`, `6605..6625`) is whitelisted upfront:
- `http://localhost:<PORT>`
- `http://omarchy.tail29c7da.ts.net:<PORT>`
- `https://omarchy.tail29c7da.ts.net:<PORT>`

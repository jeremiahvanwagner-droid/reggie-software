# OpenClaw — MIKE Memory File
_Last Updated: 2026-05-13 | Session: Perplexity Computer (MIKE Space)_

---

## 🧠 Operator Identity
- **Name:** Jeremiah Van Wagner
- **Role:** Chief Architect & Strategist, TRUTH J BLUE LLC
- **AI Persona:** Truth J Blue — philosopher, mystic in Christ, spiritual-self-help media creator
- **Mission:** Empower individuals to see their Divine power, recognize their Divine potential, align with their Divine purpose
- **GitHub:** `jeremiahvanwagner-droid`
- **Email:** support@truthjblue.com

---

## 🏗️ Platform Architecture

### Primary Stack
| Layer | Tool | Status |
|---|---|---|
| Agent Engine | OpenClaw (self-hosted, VPS) | ✅ Running |
| CRM / Ops | GoHighLevel (GHL) | ✅ Active |
| Database | Supabase | ✅ Connected |
| AI Models | Ollama on VPS | ✅ Running |
| Compute | Inngest (event-driven) | ✅ Integrated |
| Payments | Stripe | ✅ Active |
| Video AI | HeyGen | 🔧 Configured |
| Community | Skool (Divine Path Walkers) | ✅ Live |
| Mentorship | Beyond the Veil (12-week) | ✅ Active |

### VPS Model Stack (Ollama — localhost:11434)
| Model | Tag | Role |
|---|---|---|
| Qwen3.6 | `qwen3.6:latest` | Primary workhorse (replaces Claude Sonnet) |
| Qwen3 8B | `qwen3:8b` | Fast loops / low-latency (replaces Claude Haiku) |
| Kimi K2.5 | `kimi-k2.5:cloud` | Long-context overflow (proxied via ollama.com — NOT fully local) |

**Critical Note:** `kimi-k2.5:cloud` routes externally through `https://ollama.com:443`. It has no local storage footprint. Treat as remote-dependent.

---

## 📍 Current Phase: Phase 9 — Local AI Migration

### What Was Completed (Session 2026-05-13)
- Confirmed Ollama running and models available via `ollama list`
- Identified correct `baseURL`: `http://localhost:11434/v1`
- Audited proposed `models.json` — found two issues:
  1. `kimi-k2.5:cloud` is remote-proxied, not local — needs separate provider entry
  2. `tier` field in models.json may cause parse errors — schema not yet confirmed
- Proposed corrected `models.json` with split providers: `ollama-vps` (local) vs `ollama-vps-remote` (proxied)
- Identified pre-run verification step: `grep -r "models.json" /root/openclaw --include="*.ts"` to confirm schema

### What Is PENDING
- [ ] Verify `models.json` schema from codebase before writing file to VPS
- [ ] Write corrected `models.json` to `/root/openclaw/data/models.json`
- [ ] Test model routing: fast loop (qwen3:8b) → workhorse (qwen3.6:latest) → overflow (kimi-k2.5:cloud)
- [ ] Confirm agent configs in `agents_config.json` reference correct model keys
- [ ] Run full heartbeat cycle with local models
- [ ] Phase 10: GHL webhook hardening & pipeline intelligence layer

---

## 🤖 Agent Topology (5-Agent Architecture)

| Agent | Codename | Role |
|---|---|---|
| Sovereign | REGGIE | Master orchestrator, all decisions route through here |
| Herald | TBD | Inbound lead processing & speed-to-lead |
| Strategist | TBD | Pipeline intelligence & opportunity detection |
| Keeper | TBD | Data stewardship, CRM enrichment, memory writes |
| Steward | TBD | Lifecycle management, follow-up sequences |

**REGGIE** is the only agent the operator interacts with directly. All others are sub-agents.

---

## 🔑 Key Principles (SOUL.md Hard Limits)
- No critical process is manual
- No lead is unmanaged
- No insight is delayed
- No opportunity is unseen
- No system operates in isolation
- API scopes are minimized; no over-permissioning
- SOUL.md constraints override all optimization requests

---

## 📂 Critical Files Reference
| File | Purpose |
|---|---|
| `SOUL.md` | Hard limits and ethical constraints for all agents |
| `REGGIE-STATE.md` | REGGIE's live operational state |
| `MEMORY.md` | This file — cross-session intelligence |
| `PLATFORM-REFERENCE.md` | Full infrastructure reference |
| `agents_config.json` | All 5 agent definitions and model assignments |
| `build_phases.md` | Phase-by-phase build roadmap |
| `HANDOFF-MIKE-20260513.md` | Latest session handoff (current) |
| `openclaw.json.last-good` | Last verified working OpenClaw config |

---

## 🗓️ Session Log
| Date | Session | Key Outcome |
|---|---|---|
| 2026-05-11 | MIKE handoff | Initial state capture, 5-agent architecture confirmed |
| 2026-05-13 | MIKE handoff | Phase 9 audit, models.json correction, pre-run verification protocol established |

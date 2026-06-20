# Subscriptions & Costs

Verified June 2026. Prices change; each line lists the source to re-check.
Target budget: ~$100/month. The realistic core lands well under that because the
two biggest work integrations (Microsoft 365, Motion) are things you already pay for,
and LinkedIn's publishing API is free.

## Core stack

| Item | Cost | Notes | Source |
|---|---|---|---|
| Obsidian (memory store) | $0 | Free for personal and work use | https://obsidian.md/pricing |
| Obsidian Sync (optional) | ~$4–5/mo | Or sync free via iCloud/Dropbox/Git | https://obsidian.md/pricing |
| OpenRouter (models + fallback + Fusion + web search) | pay-as-you-go | Pass-through token pricing + 5.5% fee on credit purchases ($0.80 min); free model tier; `:online` adds web search. Budget $20–40/mo. | https://openrouter.ai/pricing |
| Ollama (local models + embeddings) | $0 | Free software; uses your RAM/GPU | https://ollama.com |
| Claude | existing | Your current Claude subscription, or Anthropic API key | https://claude.com |

## Voice (start free)

| Item | Cost | Notes | Source |
|---|---|---|---|
| Local: Whisper + Piper + openWakeWord | $0 | Runs on-device | open source |
| ElevenLabs (optional premium) | $5 (Starter) / $22 (Creator) | Conversational agents billed per minute | https://elevenlabs.io/pricing |

## Work connectors

| Item | Cost | Notes | Source |
|---|---|---|---|
| Microsoft 365 (OneDrive/Outlook/Teams) | existing | Uses your current work M365 via the Microsoft 365 connector | n/a |
| Motion (tasks) | existing | You already use it; has a REST API (key) for direct integration. Individual ~$29/mo current. | https://www.usemotion.com/pricing , https://docs.usemotion.com |

## LinkedIn content pipeline

| Item | Cost | Notes | Source |
|---|---|---|---|
| LinkedIn Posts API (publish text/image/video) | $0 | Requires OAuth + approved app; ~100 calls/day; tokens expire 60 days; **no native scheduling** (we hold + publish, or use native scheduler / a compliant partner). | https://learn.microsoft.com/linkedin/marketing |
| Branded video (HTML→MP4, local render) | $0 | Motion-graphics/data videos rendered on-device | n/a |
| AI avatar / generative b-roll (optional) | pay-as-you-go | Only if you want talking-head or generative clips; keep occasional. Video APIs ~$0.05–$0.75/sec. | https://elevenlabs.io , provider pricing pages |

Do NOT use browser-automation tools for LinkedIn outreach/posting — they violate
LinkedIn's User Agreement (Section 8.2) and carry real ban risk. Official API +
human approval only.

## Bottom line

Core monthly: roughly **$25–45** (OpenRouter credits + optional Obsidian Sync), on top
of subscriptions you already hold (Claude, M365, Motion). The $100 ceiling holds with
headroom unless you start generating AI-avatar/generative video heavily, which is the
one thing that can blow the budget — so it stays optional and pay-as-you-go.

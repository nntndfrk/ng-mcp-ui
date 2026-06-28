# Live-host validation — the `bootstrapWidget` real-host gate

The one thing the automated gates **structurally cannot** prove: that a generated
widget **actually renders and behaves inside a real host** (Claude, ChatGPT). The
unit/type tests, the `/mcp` inspector probe, and the cross-major fixture matrix
(`ci-matrix`) all prove the bundle graph, the protocol, and the server logic —
but rendering inside a host iframe needs a human with eyes on the screen.

> **An agent can build the demo, open the tunnel, and prep this checklist — but
> only a human can sign off the MUST rows below.**

This validates the **same artifact** the schematic ships: a fresh SSR app
retrofitted by `ng generate ng-mcp-ui:ng-add --example=demo` (the LOCKED Quick
Poll demo, Path B). It is NOT a committed dev-app — it is generated on demand by
the harness, so a green walk certifies the real `ng add` + `example` output.

---

## 0. Floor (must be green first — don't start the walk if any is red)

- `npm run lint && npm run typecheck && npm test && npm run test:types`
- `npm run ci:fixture -- --ng-version 22` — builds a real retrofit app, AOT-builds
  the widget bundle + SSR host, and probes `/mcp` (echo + poll, 16 checks). The
  cross-major matrix (`ci-matrix.yml`, 20/21/22) is the CI version of this.

If those are green, the bundle + protocol + server logic are sound; the walk only
adds the eyes-on-host dimension.

---

## 1. Boot + expose (one command)

`cloudflared` must be on `PATH` (`brew install cloudflared` / see Cloudflare docs).
TryCloudflare tunnels are **zero-auth and unauthenticated** — anyone with the random
URL can reach your local server while it's up, so only run this for a short dev walk
and Ctrl-C it when done.

```bash
npm run live-host
```

This (via `tools/ci-fixture.mjs --serve --tunnel`): packs `ng-mcp-ui`, `ng new`s a
fresh SSR app at Angular 22, installs the tarball + peers, runs the retrofit with
`--example=demo`, AOT-builds widgets + SSR, **boots the server and opens a
cloudflared tunnel**, then prints:

```
🌐 PUBLIC URL: https://<random>.trycloudflare.com
👉 paste THIS into the host connector: https://<random>.trycloudflare.com/mcp
```

Leave it running (Ctrl-C stops the server + tunnel). First run takes a few minutes
(`ng new` + install + AOT build); the URL line appears once the tunnel is up.

> The TryCloudflare URL is **ephemeral** (new every run, rate-limited) — fine for a
> dev walk. Options: `npm run live-host` auto-tunnels; `npm run ci:fixture -- --serve`
> (no `--tunnel`) serves locally and prints the manual `cloudflared` command;
> `--port <N>` changes the port (default 4400).

**Connect Claude:** Settings → Connectors → Add custom connector → paste the
`…/mcp` URL → enable for the conversation.

**Connect ChatGPT (developer mode / Apps):** Settings → Connectors → Create →
Import → paste the `…/mcp` URL → save → select it in the composer.

---

## 2. The narrative to walk (type to the model, in order, in EACH host)

1. *"Create a poll asking the team where we should have lunch — options: Sushi,
   Tacos, Salad."*
2. (the poll view renders) → **click a vote** in the view, e.g. Tacos.
3. *"Tally the votes"* (or click the **Tally votes** button in the view).
4. *"Summarize the outcome."* — the model should answer using the view's synced
   state (it should know what you voted).

---

## 3. Capability checklist (sign off per host)

**MUST** rows gate the demo; **NICE** rows are host-dependent — mark `n/a (host)`
rather than failing when a host doesn't implement the surface.

| # | Capability | Expected | Library API | Claude | ChatGPT |
|---|---|---|---|:--:|:--:|
| 1 | Tool → view render (MUST) | `create_poll` renders the poll view (question + 3 options) | `registerTool({ view })` + `injectToolInfo` | ⬜ | ⬜ |
| 2 | Typed server→view data (MUST) | question/options/initial 0-tallies arrive in the view | `injectToolInfo<…>()` | ⬜ | ⬜ |
| 3 | View → server call (MUST) | clicking an option records the vote; **Tally votes** refreshes bars | `injectCallTool('cast_vote'/'tally_votes')` | ⬜ | ⬜ |
| 4 | Persisted view state (MUST) | your vote (✓ + highlight) survives a view reopen/re-render | `injectViewState({ myVote })` | ⬜ | ⬜ |
| 5 | LLM-visible context (MUST) | "summarize the outcome" → the model knows what **you** voted | `[dataLlm]` | ⬜ | ⬜ |
| 6 | Drive the conversation (NICE) | **Discuss results** sends a follow-up prompt | `injectSendFollowUpMessage()` | ⬜ | ⬜ |
| 7 | Theme adaptation (NICE) | host light/dark toggle reskins the poll | `injectLayout()` → theme | ⬜ | ⬜ |
| 8 | Safe-area / layout (NICE) | bottom padding respects host safe-area inset | `injectLayout()` → safeArea | ⬜ | ⬜ |
| 9 | Display mode (NICE) | **Expand** → fullscreen; **Collapse** → inline | `injectDisplayMode()` | ⬜ | ⬜ |
| 10 | Cross-runtime parity (MUST) | identical widget code renders + behaves in both hosts | apps-sdk + mcp-app adaptors | ⬜ | ⬜ |

> Row 8 (safe-area) is typically `n/a` on desktop hosts (zero insets) — needs a
> mobile host to produce non-zero padding.

---

## 4. Edge cases worth a glance

- A brand-new poll shows 0/0/0 tallies with **no divide-by-zero glitch** (the
  widget guards `aria-valuemax` and the bar widths at total = 0).
- The accessible vote buttons are toggle-buttons (`aria-pressed`), not a radio
  group — Tab + Enter/Space work; no arrow-key roving is expected.

---

## 5. Sign-off

Record the result here once walked. The gate is: **MUST rows 1–5 + 10 green on
BOTH Claude and ChatGPT.**

```
Status: 🟢 SIGNED OFF — render walk machine-verified on real Claude; the reserved
        in-iframe interaction rows walked and confirmed by a human on 2026-06-28.
Walked by: agent (browser automation, render rows) + human (interaction rows)   Date: 2026-06-28
Claude  (model: Opus 4.8): MUST 1–5 + 10 ✅; NICE 6,7,8,9 ✅
ChatGPT: MUST 1–5 + 10 ✅ (human walk)
Notes:
  Two-part walk against the real production library + real schematic output:
  — Automated (agent) PROVEN by eyes on the real claude.ai host iframe, over a live
    TryCloudflare tunnel (npm run live-host, Angular-22 retrofit + --example=demo):
    • Row 1 (tool→view render): "Create a poll … Sushi/Tacos/Salad" → Claude called
      test-mcp-ui create_poll → interactive poll widget rendered in the host iframe.
    • Row 2 (typed server→view data): question "Where should we have lunch?" + the
      three options + initial 0/0/0 tally bars + "0 votes" all arrived in the view.
    • Row 9 (NICE, display mode): Expand → fullscreen; Collapse → inline, both work.
  — Human walk completed the rows this automation structurally could NOT drive (the
    vote-option buttons, Tally votes, and Discuss results live inside a SANDBOXED
    CROSS-ORIGIN iframe on the trycloudflare origin, which index-based click cannot
    reach — NOT a widget defect): rows 3 (view→server call), 4 (persisted myVote),
    5 (dataLlm context), 6 (follow-up), 7 (theme), 8 (safe-area), and 10 (cross-
    runtime parity, incl. ChatGPT). Human confirmed all MUST rows green on both hosts.
```

> Provenance: the draft demo (`.claude/draft/examples/dev-app/E2E.md`) was
> human-signed-off on both hosts on 2026-06-14 — but against the **draft**
> library. This walk re-validates the **production** library + the real schematic
> output, which is why it's a distinct gate (Path B defers the demo's live-host
> lock to here).

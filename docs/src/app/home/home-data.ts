/**
 * Landing-page copy. Ported from the approved comp, with the command lines and
 * package blurbs corrected against the real library (the comp's terminal used
 * placeholder commands that this project does not ship).
 */

export interface Labelled {
  name: string;
  desc: string;
}

export const API_CARDS: Labelled[] = [
  {
    name: "injectToolInfo()",
    desc: "Typed tool input, output and metadata, pushed by the host after boot.",
  },
  {
    name: "injectCallTool()",
    desc: "Call a server tool from inside the view and track its lifecycle.",
  },
  {
    name: "injectViewState()",
    desc: "Persisted per-view state that survives host re-renders.",
  },
  {
    name: "injectLayout()",
    desc: "Theme, display mode, and safe-area insets from the host.",
  },
  {
    name: "[dataLlm]",
    desc: "Directive surfacing in-view content the model may read as context.",
  },
  {
    name: "mcpAsset",
    desc: "Pipe resolving widget asset URLs inside the sandboxed iframe.",
  },
];

export const TERMINAL_LINES: { cmd: string; note: string }[] = [
  { cmd: "ng add ng-mcp-ui --example=demo", note: "retrofits SSR + /mcp" },
  { cmd: "ng generate ng-mcp-ui:view poll", note: "scaffold a widget" },
  { cmd: "ng generate ng-mcp-ui:tool cast_vote", note: "typed Zod tool" },
  { cmd: "npm run build:widgets", note: "code-split chunks" },
  { cmd: "npm run dev:mcp", note: "ng serve, /mcp live" },
  { cmd: "npm run tunnel", note: "expose it to a real host" },
];

/**
 * The architecture section's snippet. Kept as a plain string (not markup) so the
 * component template never has to contain raw code — see ./highlight.ts.
 */
export const POLL_SNIPPET = `import { Component, computed } from '@angular/core';
import { injectCallTool, injectToolInfo } from 'ng-mcp-ui/web';

@Component({
  selector: 'poll-widget',
  template: \`
    @let p = poll();
    @if (p) {
      <h1>{{ p.question }}</h1>
      @for (o of p.options; track o) {
        <button (click)="vote(o)">{{ o }}</button>
      }
    }
  \`,
})
export default class PollWidget {
  // the tool that rendered this view, as a state signal
  private readonly tool = injectToolInfo<{ output: Poll }>();
  private readonly castVote = injectCallTool<VoteArgs, VoteResult>('cast_vote');

  protected readonly poll = computed(() => {
    const s = this.tool();
    return s.isSuccess ? s.output : null;
  });

  protected vote(option: string) {
    this.castVote.callTool({ pollId: this.poll()?.pollId, option });
  }
}`;

export const ARCH_POINTS: string[] = [
  "/mcp and widget asset routes mount before Angular's SSR catch-all.",
  "Widgets hydrate from host-pushed tool data, never from baked-in HTML.",
  "Signals, not hooks — zoneless-friendly and Angular-native throughout.",
];

export const VERSIONS: { label: string; status: string; note: string }[] = [
  {
    label: "v20",
    status: "PASSING",
    note: "Cross-major fixture builds a real retrofit app on every push.",
  },
  {
    label: "v21",
    status: "PASSING",
    note: "AOT widget bundle + SSR host, /mcp probed end to end.",
  },
  {
    label: "v22",
    status: "PASSING",
    note: "Latest major, same schematic output, no config drift.",
  },
];

export const PACKAGES: { name: string; purpose: string; route: string }[] = [
  {
    name: "ng-mcp-ui/server",
    purpose:
      "Framework-neutral MCP server: McpServer, the mountable Express router, content helpers, view resources, auth.",
    route: "/docs/reference/server",
  },
  {
    name: "ng-mcp-ui/web",
    purpose:
      "Angular bridge: provideMcpUi, bootstrapWidget, the inject* signal API, the [dataLlm] directive and mcpAsset pipe.",
    route: "/docs/reference/web",
  },
  {
    name: "ng-mcp-ui/testing",
    purpose:
      "MockAdaptor and provideMockMcpUi test harness for unit-testing widgets.",
    route: "/docs/reference/testing",
  },
  {
    name: "ng-mcp-ui/tunnel",
    purpose:
      "Slot for the cloudflared dev-tunnel manager — a skeleton today; the live walk runs through the repo harness.",
    route: "/docs/guides/host-bridge",
  },
];

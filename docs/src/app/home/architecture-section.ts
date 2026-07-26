import { ChangeDetectionStrategy, Component } from "@angular/core";

import { ARCH_POINTS, POLL_SNIPPET } from "./home-data";
import { highlight } from "./highlight";

@Component({
  selector: "home-architecture",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <div class="inner">
        <div>
          <p class="eyebrow magenta">Architecture</p>
          <h2>SSR gives you the server, not the render</h2>
          <p class="lede">
            The MCP JSON-RPC endpoint and widget asset routes mount into your existing Angular
            <code>server.ts</code> before the SSR catch-all. Views are client-bootstrapped widgets,
            code-split by the standard Angular builder, hydrated from host-pushed tool data.
          </p>
          <div class="points">
            @for (point of points; track point) {
              <div class="point">
                <span class="bullet" aria-hidden="true"></span>
                <span>{{ point }}</span>
              </div>
            }
          </div>
        </div>

        <div class="code-card">
          <div class="filename">src/widgets/poll/poll.widget.ts</div>
          <pre><code>@for (line of lines; track $index) {<span
            class="ln">@for (token of line; track $index) {<span
              [class]="token.kind">{{ token.text }}</span>}</span>}</code></pre>
        </div>
      </div>
    </section>
  `,
  styles: `
    section { border-bottom: 1px solid var(--border); }
    .inner {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 70px 28px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 56px;
      align-items: center;
    }
    .magenta { color: var(--magenta); }

    h2 {
      margin: 0;
      font-size: 32px;
      letter-spacing: -0.03em;
      font-weight: 700;
      line-height: 1.15;
    }
    .lede {
      margin: 16px 0 0;
      font-size: 16px;
      line-height: 1.65;
      color: var(--muted);
      text-wrap: pretty;
    }
    .lede code { font-family: var(--font-mono); font-size: 14.5px; color: var(--text); }

    .points { display: grid; gap: 12px; margin-top: 26px; }
    .point { display: flex; gap: 12px; align-items: flex-start; }
    .point span:last-child { font-size: 15px; line-height: 1.55; color: var(--body); }
    .bullet {
      margin-top: 7px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e4004f, #7b3fe4);
      flex: none;
    }

    .code-card {
      border-radius: 14px;
      border: 1px solid var(--border2);
      background: var(--bg2);
      overflow: hidden;
      min-width: 0;
    }
    .filename {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--dim);
    }
    pre {
      margin: 0;
      padding: 22px;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.8;
      color: var(--code);
      overflow-x: auto;
    }
    .ln { display: block; white-space: pre; min-height: 1.8em; }
    .kw { color: var(--kw); }
    .str { color: var(--str); }
    .cmt { color: var(--cmt); }

    @media (max-width: 980px) {
      .inner { grid-template-columns: 1fr; gap: 34px; padding: 52px 18px; }
      h2 { font-size: 28px; }
    }
  `,
})
export class ArchitectureSection {
  protected readonly points = ARCH_POINTS;
  protected readonly lines = highlight(POLL_SNIPPET);
}

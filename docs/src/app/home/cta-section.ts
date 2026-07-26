import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";

import { DOCS_ENTRY_ROUTE } from "../site/site";

@Component({
  selector: "home-cta",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section>
      <div class="inner">
        <div class="glow" aria-hidden="true"></div>
        <div class="content">
          <div class="gradient-mark mark" aria-hidden="true"></div>
          <h2>Retrofit your app in one command</h2>
          <p>
            Ships a working poll widget, an MCP endpoint, and a dev tunnel you can point a real
            host at.
          </p>
          <div class="cmd">
            <span class="prompt">$</span><span>ng add ng-mcp-ui --example=demo</span>
          </div>
          <a class="read" [routerLink]="docsRoute">Read the docs →</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .inner {
      position: relative;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 88px 28px;
      text-align: center;
      overflow: hidden;
    }
    .glow {
      position: absolute;
      bottom: -260px;
      left: 50%;
      transform: translateX(-50%);
      width: 900px;
      height: 460px;
      background: radial-gradient(ellipse at center, var(--glowB), transparent 68%);
      pointer-events: none;
    }
    .content { position: relative; }
    .mark { width: 38px; height: 38px; margin: 0 auto 22px; border-radius: 11px; }
    h2 { margin: 0; font-size: 38px; letter-spacing: -0.03em; font-weight: 700; }
    p {
      margin: 14px auto 30px;
      max-width: 520px;
      font-size: 16.5px;
      color: var(--muted);
      line-height: 1.6;
    }
    .cmd {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      height: 48px;
      border-radius: 10px;
      background: var(--panel);
      border: 1px solid var(--border2);
      font-family: var(--font-mono);
      font-size: 14px;
    }
    .prompt { color: var(--accent); }
    .read { display: block; margin-top: 24px; font-size: 14.5px; color: var(--muted); }
    .read:hover { color: var(--accent); }

    @media (max-width: 640px) {
      .inner { padding: 64px 18px; }
      h2 { font-size: 28px; }
      .cmd { font-size: 12.5px; }
    }
  `,
})
export class CtaSection {
  protected readonly docsRoute = DOCS_ENTRY_ROUTE;
}

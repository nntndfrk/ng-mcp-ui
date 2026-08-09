import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  DOCS_ENTRY_ROUTE,
  LIBRARY_VERSION,
  NEXT_DOCS_URL,
  REPO_URL,
} from "../site/site";
import { TERMINAL_LINES } from "./home-data";

type Installer = "ng" | "npm";

@Component({
  selector: "home-hero",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section>
      <div class="glow" aria-hidden="true"></div>
      <div class="inner">
        <a class="badge" [routerLink]="docsRoute">
          <span class="pill">v{{ version }}</span>
          <span class="badge-text">Live-host validation signed off on Claude &amp; ChatGPT</span>
          <span class="badge-arrow" aria-hidden="true">→</span>
        </a>

        <h1>
          Turn your Angular app into <span class="grad">interactive MCP widgets</span> — without
          leaving Angular
        </h1>
        <p class="lede">
          A schematic and a signals-native library that retrofits an existing Angular app with MCP
          views that render inside Claude, ChatGPT, and any MCP-Apps host. One
          <code>ng add</code>. No new runtime.
        </p>

        <div class="tabs" role="group" aria-label="Install method">
          <button type="button" [class.on]="installer() === 'ng'" (click)="installer.set('ng')">
            ng add
          </button>
          <button type="button" [class.on]="installer() === 'npm'" (click)="installer.set('npm')">
            npm
          </button>
        </div>

        <div class="cta-row">
          <div class="cmd">
            <span class="prompt">$</span>
            <span>{{ installCmd() }}</span>
            <button type="button" class="copy" (click)="copy()">{{ copyLabel() }}</button>
          </div>
          <a class="ghost" [href]="repoUrl" rel="noreferrer noopener">View repo</a>
        </div>

        <p class="line-switch">
          This is 0.2.x, the line today's hosts connect to. Targeting the
          <strong>MCP 2026-07-28</strong> revision?
          <a [href]="nextDocsUrl" rel="noreferrer noopener">Read the 1.x beta docs →</a>
        </p>

        <div class="terminal">
          <div class="chrome">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            <span class="chrome-label">terminal</span>
          </div>
          <div class="lines">
            @for (line of terminalLines; track line.cmd) {
              <div class="line">
                <span class="prompt">$</span>
                <span class="cmd-text">{{ line.cmd }}</span>
                <span class="fill"></span>
                <span class="note">{{ line.note }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    section {
      position: relative;
      overflow: hidden;
      border-bottom: 1px solid var(--border);
    }

    .glow {
      position: absolute;
      top: -340px;
      left: 50%;
      transform: translateX(-50%);
      width: 1100px;
      height: 600px;
      background: radial-gradient(ellipse at center, var(--glowA), var(--glowB) 45%, transparent 70%);
      pointer-events: none;
    }

    .inner {
      position: relative;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 76px 28px 88px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 5px 6px;
      border: 1px solid var(--border2);
      border-radius: 999px;
      background: var(--surface);
      font-size: 12.5px;
      margin-bottom: 32px;
    }
    .badge:hover { color: var(--text); border-color: var(--hoverBorder); }
    .pill {
      padding: 2px 9px;
      border-radius: 999px;
      background: linear-gradient(90deg, #e4004f, #c6009b);
      font-weight: 600;
      font-size: 11.5px;
      color: #ffffff;
    }
    .badge-text { color: var(--body); }
    .badge-arrow { color: var(--faint); padding-right: 10px; }

    h1 {
      margin: 0;
      max-width: 920px;
      font-size: 60px;
      line-height: 1.04;
      letter-spacing: -0.035em;
      font-weight: 700;
      text-wrap: pretty;
    }
    .grad {
      background: linear-gradient(100deg, #e4004f, #c6009b 45%, #7b3fe4);
      background-clip: text;
      -webkit-background-clip: text;
      color: transparent;
    }

    .lede {
      margin: 26px 0 0;
      max-width: 620px;
      font-size: 18px;
      line-height: 1.55;
      color: var(--muted);
      text-wrap: pretty;
    }
    .lede code { font-family: var(--font-mono); font-size: 15.5px; color: var(--text); }

    .tabs {
      display: inline-flex;
      gap: 2px;
      margin-top: 36px;
      padding: 3px;
      border-radius: 10px;
      background: var(--surface3);
      border: 1px solid var(--border);
    }
    .tabs button {
      padding: 6px 14px;
      border: none;
      border-radius: 7px;
      background: none;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 500;
      color: var(--faint);
      cursor: pointer;
    }
    .tabs button.on { background: var(--active); color: var(--text); }

    .cta-row {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      align-items: stretch;
      flex-wrap: wrap;
    }

    .cmd {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 14px;
      height: 46px;
      border-radius: 10px;
      background: var(--panel);
      border: 1px solid var(--border2);
      font-family: var(--font-mono);
      font-size: 14px;
    }
    .prompt { color: var(--accent); }
    .copy {
      margin-left: 10px;
      padding: 4px 9px;
      border: none;
      border-radius: 6px;
      background: var(--surface2);
      color: var(--muted);
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .copy:hover { color: var(--text); }

    .ghost {
      display: flex;
      align-items: center;
      padding: 0 20px;
      height: 46px;
      border-radius: 10px;
      border: 1px solid var(--border2);
      font-size: 14px;
      font-weight: 500;
      color: var(--body);
    }
    .ghost:hover { border-color: var(--hoverBorder); color: var(--hoverText); }

    .line-switch {
      margin: 16px 0 0;
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--dim);
    }
    .line-switch strong { color: var(--body); font-weight: 600; }
    .line-switch a { color: var(--body); }
    .line-switch a:hover { color: var(--hoverText); }

    .terminal {
      margin-top: 52px;
      border-radius: 14px;
      border: 1px solid var(--border2);
      background: var(--bg2);
      overflow: hidden;
      max-width: 860px;
    }
    .chrome {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--border);
    }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--dot); }
    .chrome-label {
      margin-left: 8px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--dim);
    }
    .lines {
      padding: 20px 22px;
      font-family: var(--font-mono);
      font-size: 13.5px;
      line-height: 2.15;
      display: grid;
      overflow-x: auto;
    }
    .line { display: flex; gap: 10px; }
    .cmd-text { color: var(--code); white-space: nowrap; }
    .fill { flex: 1; min-width: 24px; }
    .note { color: var(--dim); white-space: nowrap; }

    @media (max-width: 860px) {
      .inner { padding: 56px 18px 64px; }
      h1 { font-size: 40px; }
      .lede { font-size: 16.5px; }
    }
  `,
})
export class HeroSection {
  protected readonly terminalLines = TERMINAL_LINES;
  protected readonly repoUrl = REPO_URL;
  protected readonly nextDocsUrl = NEXT_DOCS_URL;
  protected readonly docsRoute = DOCS_ENTRY_ROUTE;
  protected readonly version = LIBRARY_VERSION;

  protected readonly installer = signal<Installer>("ng");
  protected readonly copied = signal(false);

  protected readonly installCmd = computed(() =>
    this.installer() === "ng"
      ? "ng add ng-mcp-ui --example=demo"
      : "npm i ng-mcp-ui",
  );
  protected readonly copyLabel = computed(() =>
    this.copied() ? "Copied" : "Copy",
  );

  protected copy(): void {
    void navigator.clipboard?.writeText(this.installCmd()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    });
  }
}

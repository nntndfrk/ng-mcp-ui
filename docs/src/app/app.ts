import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

import { SiteFooter } from "./site/site-footer";
import { SiteHeader } from "./site/site-header";

@Component({
  selector: "app-root",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeader, SiteFooter],
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <site-header />
    <main id="main">
      <router-outlet />
    </main>
    <site-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
    }
    main { flex: 1; }
    .skip {
      position: absolute;
      left: -9999px;
      top: 8px;
      z-index: 200;
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--panel);
      border: 1px solid var(--border2);
      font-size: 13.5px;
    }
    .skip:focus { left: 12px; }
  `,
})
export class App {}

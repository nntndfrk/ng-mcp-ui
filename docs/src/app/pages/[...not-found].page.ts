import type { RouteMeta } from "@analogjs/router";
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";

import { DOCS_ENTRY_ROUTE, REPO_URL } from "../site/site";

export const routeMeta: RouteMeta = {
  title: "Page not found",
  meta: [{ name: "robots", content: "noindex" }],
};

/**
 * Catch-all, and the thing GitHub Pages renders for any unmatched path.
 *
 * The build prerenders /404.html with `ssr: false`, so Pages serves that shell
 * and the router resolves the real URL in the browser. Without a route that
 * matches everything, that resolution throws NG04002 and the visitor gets a
 * blank page — this component is what makes the SPA fallback actually work.
 */
@Component({
  selector: "not-found-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section>
      <p class="code">404</p>
      <h1>This page doesn't exist</h1>
      <p class="lede">
        The link may be out of date, or the page may have moved as the library
        evolved. The documentation index is a good place to pick the trail back up.
      </p>
      <div class="actions">
        <a class="primary" [routerLink]="docsEntry">Browse the docs</a>
        <a class="ghost" routerLink="/">Back to home</a>
        <a class="ghost" [href]="repoUrl" rel="noopener">Report a broken link</a>
      </div>
    </section>
  `,
  styles: `
    section {
      max-width: 620px;
      margin: 0 auto;
      padding: 120px 28px 160px;
      text-align: center;
    }

    .code {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 13px;
      letter-spacing: 0.14em;
      color: var(--accent);
    }

    h1 {
      margin: 14px 0 0;
      font-size: 38px;
      letter-spacing: -0.035em;
      font-weight: 700;
    }

    .lede {
      margin: 16px 0 0;
      font-size: 16.5px;
      line-height: 1.7;
      color: var(--muted);
      text-wrap: pretty;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 30px;
    }

    .actions a {
      display: inline-flex;
      align-items: center;
      height: 38px;
      padding: 0 16px;
      border-radius: 10px;
      border: 1px solid var(--border2);
      font-size: 14px;
      font-weight: 500;
    }

    .primary {
      border-color: transparent;
      background: linear-gradient(135deg, #e4004f, #c6009b 55%, #7b3fe4);
      color: #ffffff;
    }
    .primary:hover { color: #ffffff; opacity: 0.9; }

    .ghost { background: var(--surface); color: var(--muted); }
    .ghost:hover { border-color: var(--hoverBorder); color: var(--text); }

    @media (max-width: 620px) {
      section { padding: 80px 20px 110px; }
      h1 { font-size: 30px; }
    }
  `,
})
export default class NotFoundPage {
  protected readonly docsEntry = DOCS_ENTRY_ROUTE;
  protected readonly repoUrl = `${REPO_URL}/issues/new`;
}

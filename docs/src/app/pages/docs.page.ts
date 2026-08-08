import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { Meta } from "@angular/platform-browser";
import {
  ActivatedRoute,
  type ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from "@angular/router";
import { filter, map, startWith } from "rxjs";

import { DocsIndex } from "../docs/docs-index";
import { DocsPager } from "../docs/docs-pager";
import { DocsSidebar } from "../docs/docs-sidebar";
import { DocsToc } from "../docs/docs-toc";
import { extractHeadings } from "../docs/headings";

/**
 * Analog attaches the page's rendered content to the generated content route as
 * `_analogContent`. How deeply that route nests under this layout is an
 * implementation detail of the file router, so walk the snapshot chain rather
 * than assuming it is the immediate child.
 */
const CONTENT_KEY = "_analogContent";

function findContent(snapshot: ActivatedRouteSnapshot | null): string {
  for (let node = snapshot; node; node = node.firstChild) {
    const content = node.data[CONTENT_KEY];
    if (typeof content === "string") {
      return content;
    }
  }
  return "";
}

/**
 * Layout route for everything under /docs.
 *
 * The pages themselves are the markdown files in src/content/docs, which
 * Analog's file router turns into routes rendered by its MarkdownRouteComponent.
 * This component supplies the chrome around them — sidebar, heading, table of
 * contents, pager — reading the active child route to know which page is showing.
 */
@Component({
  selector: "docs-layout",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, DocsSidebar, DocsToc, DocsPager],
  template: `
    <div class="layout">
      <aside class="rail">
        <docs-sidebar />
      </aside>

      <article>
        @if (entry(); as page) {
          <div class="crumbs">
            <a routerLink="/">Home</a>
            <span aria-hidden="true">/</span>
            <span>{{ page.group }}</span>
            <span aria-hidden="true">/</span>
            <span class="here">{{ page.title }}</span>
          </div>
          <h1>{{ page.title }}</h1>
          <p class="lede">{{ page.description }}</p>
        }

        <div class="prose">
          <router-outlet />
        </div>

        <docs-pager [prev]="neighbours().prev" [next]="neighbours().next" />
      </article>

      <aside class="toc">
        <docs-toc [headings]="headings()" />
      </aside>
    </div>
  `,
  styles: `
    .layout {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 236px minmax(0, 1fr) 200px;
      gap: 44px;
      padding: 0 28px;
    }

    .rail {
      position: sticky;
      top: var(--nav-h);
      max-height: calc(100vh - var(--nav-h));
      overflow: auto;
      padding: 34px 0 60px;
    }

    .toc {
      position: sticky;
      top: var(--nav-h);
      max-height: calc(100vh - var(--nav-h));
      overflow: auto;
      padding: 44px 0;
    }

    article { padding: 44px 0 100px; min-width: 0; }

    .crumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 13px;
      color: var(--faint);
      margin-bottom: 18px;
      font-family: var(--font-mono);
    }
    .crumbs a { color: var(--faint); }
    .crumbs a:hover { color: var(--accent); }
    .crumbs .here { color: var(--muted); }

    h1 { margin: 0; font-size: 40px; letter-spacing: -0.035em; font-weight: 700; }
    .lede {
      margin: 16px 0 30px;
      font-size: 17px;
      line-height: 1.65;
      color: var(--muted);
      text-wrap: pretty;
    }

    @media (max-width: 1180px) {
      .layout { grid-template-columns: 220px minmax(0, 1fr); gap: 34px; }
      .toc { display: none; }
    }

    @media (max-width: 820px) {
      .layout { grid-template-columns: minmax(0, 1fr); padding: 0 18px; }
      .rail {
        position: static;
        max-height: none;
        padding: 26px 0 22px;
        border-bottom: 1px solid var(--border);
      }
      article { padding: 28px 0 72px; }
      h1 { font-size: 30px; }
    }
  `,
})
export default class DocsLayout {
  private readonly index = inject(DocsIndex);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);

  /**
   * Re-read on every completed navigation. The child route carries the rendered
   * page content, so the table of contents can be built during prerender
   * instead of scraped from the DOM after hydration.
   */
  private readonly active = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.read()),
    ),
    { initialValue: { route: "", content: "" } },
  );

  protected readonly entry = computed(() =>
    this.index.find(this.active().route),
  );
  protected readonly neighbours = computed(() =>
    this.index.neighbours(this.active().route),
  );
  protected readonly headings = computed(() =>
    extractHeadings(this.active().content),
  );

  constructor() {
    // The generated markdown route sets <title> from front matter; the page
    // description is ours to keep in sync.
    effect(() => {
      const content = this.entry()?.description;
      if (content) {
        this.meta.updateTag({ name: "description", content });
      }
    });
  }

  private read(): { route: string; content: string } {
    return {
      route: (this.router.url.split("#")[0] ?? "").split("?")[0] ?? "",
      content: findContent(this.route.snapshot),
    };
  }
}

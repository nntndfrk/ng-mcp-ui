import { provideContent, withMarkdownRenderer } from "@analogjs/content";
import { withShikiHighlighter } from "@analogjs/content/shiki-highlighter";
import { provideFileRouter, requestContextInterceptor } from "@analogjs/router";
import { APP_BASE_HREF } from "@angular/common";
import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideClientHydration, withEventReplay } from "@angular/platform-browser";
import { TitleStrategy, withInMemoryScrolling } from "@angular/router";

import { SuffixTitleStrategy } from "./site/title-strategy";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // GitHub Pages serves this site from /ng-mcp-ui/. Vite's `base` lands in
    // import.meta.env.BASE_URL, and Angular needs the same value to generate and
    // match URLs — see the "custom URL prefix" recipe in the Analog docs.
    //
    // This provider is the *only* place the prefix is declared: index.html
    // deliberately ships without a <base> element. Vite already rewrites every
    // asset URL and RouterLink already prefixes every route, so the tag added
    // nothing — but it broke every fragment link on the site. Per the HTML spec
    // a bare `#anchor` href resolves against the document *base* URL, so under
    // `<base href="/ng-mcp-ui/">` the "On this page" table of contents and the
    // "Skip to content" link navigated to the landing page instead of scrolling
    // in place. Don't reintroduce the tag.
    { provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL || "/" },
    provideFileRouter(
      withInMemoryScrolling({ anchorScrolling: "enabled", scrollPositionRestoration: "enabled" }),
    ),
    { provide: TitleStrategy, useClass: SuffixTitleStrategy },
    provideHttpClient(withFetch(), withInterceptors([requestContextInterceptor])),
    provideClientHydration(withEventReplay()),
    provideContent(withMarkdownRenderer(), withShikiHighlighter()),
  ],
};

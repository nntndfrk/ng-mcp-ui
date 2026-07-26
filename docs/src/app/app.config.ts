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

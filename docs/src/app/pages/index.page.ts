import type { RouteMeta } from "@analogjs/router";
import { ChangeDetectionStrategy, Component } from "@angular/core";

import { ArchitectureSection } from "../home/architecture-section";
import { CompatibilitySection } from "../home/compatibility-section";
import { CtaSection } from "../home/cta-section";
import { HeroSection } from "../home/hero-section";
import { LibrarySection } from "../home/library-section";

export const routeMeta: RouteMeta = {
  title: "ng-mcp-ui — interactive Angular views for MCP hosts",
  meta: [
    {
      name: "description",
      content:
        "An Angular schematic and signals-native library that retrofits an existing Angular app with MCP views that render inside Claude, ChatGPT, and any MCP-Apps host.",
    },
  ],
};

@Component({
  selector: "home-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HeroSection,
    LibrarySection,
    ArchitectureSection,
    CompatibilitySection,
    CtaSection,
  ],
  template: `
    <home-hero />
    <home-library />
    <home-architecture />
    <home-compatibility />
    <home-cta />
  `,
})
export default class HomePage {}

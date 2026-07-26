import { Injectable, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { type RouterStateSnapshot, TitleStrategy } from "@angular/router";

const SUFFIX = "ng-mcp-ui";
const HOME_TITLE = "ng-mcp-ui — interactive Angular views for MCP hosts";

/**
 * Doc pages get their route title from markdown front matter, which has no idea
 * what site it belongs to. Append the product name once, here, instead of in
 * fifteen front-matter blocks.
 */
@Injectable()
export class SuffixTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot);
    this.title.setTitle(routeTitle ? `${routeTitle} — ${SUFFIX}` : HOME_TITLE);
  }
}

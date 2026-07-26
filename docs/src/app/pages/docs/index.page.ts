import type { RouteMeta } from "@analogjs/router";

import { DOCS_ENTRY_ROUTE } from "../../site/site";

/**
 * /docs has no page of its own — send readers to the first one.
 *
 * Deliberately no default export. Analog builds every page route as
 * `{ path: '', component: m.default, ...routeMeta }`, so exporting a component
 * here would produce a route carrying both `component` and `redirectTo` —
 * which Angular rejects with NG04014. That check is dev-only, so the pair
 * survives a production build and only breaks `npm run docs:dev`.
 */
export const routeMeta: RouteMeta = {
  redirectTo: DOCS_ENTRY_ROUTE,
  pathMatch: "full",
};

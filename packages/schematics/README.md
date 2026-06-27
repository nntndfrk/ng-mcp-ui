# ng-mcp-ui-schematics

The `ng-mcp-ui` schematics package: an `ng add` retrofit plus `view` / `tool` /
`example` generators that wire an Angular app up with [ng-mcp-ui](../ng-mcp-ui).
This is an internal, `private` package compiled to CommonJS; at pack time its
`dist/` is embedded into `ng-mcp-ui` under `dist/schematics/`, so users run a
single `ng add ng-mcp-ui`.

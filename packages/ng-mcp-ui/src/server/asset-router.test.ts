// Tests for `createViewAssetRouter` (S06, PLAN §5.1) via supertest.

import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createViewAssetRouter } from "./asset-router.js";

function appWith(router: express.Router) {
  const app = express();
  app.use("/assets/widgets", router);
  return app;
}

describe("createViewAssetRouter (production / static)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ng-mcp-ui-assets-"));
    writeFileSync(join(dir, "main-XBYE53NT.js"), "export const x = 1;\n", "utf8");
    writeFileSync(join(dir, "styles-3KHXIMM7.css"), ".a{color:red}\n", "utf8");
    writeFileSync(join(dir, "index.html"), "<!doctype html>\n", "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("sends Access-Control-Allow-Origin: * on assets", async () => {
    const res = await request(appWith(createViewAssetRouter({ dir })))
      .get("/assets/widgets/main-XBYE53NT.js")
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("sets a JS content-type for .js bundles", async () => {
    const res = await request(appWith(createViewAssetRouter({ dir })))
      .get("/assets/widgets/main-XBYE53NT.js")
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/javascript");
  });

  it("immutable cache for hashed files, no-cache for index.html", async () => {
    const app = appWith(createViewAssetRouter({ dir }));

    const hashed = await request(app)
      .get("/assets/widgets/main-XBYE53NT.js")
      .expect(200);
    expect(hashed.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );

    const cssHashed = await request(app)
      .get("/assets/widgets/styles-3KHXIMM7.css")
      .expect(200);
    expect(cssHashed.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );

    const index = await request(app)
      .get("/assets/widgets/index.html")
      .expect(200);
    expect(index.headers["cache-control"]).toBe("no-cache");
  });

  it("404s an unknown asset (passthrough, not a crash)", async () => {
    await request(appWith(createViewAssetRouter({ dir })))
      .get("/assets/widgets/does-not-exist.js")
      .expect(404);
  });

  it("does not set Vary: Origin (ACAO is a constant *, not a reflected origin)", async () => {
    const res = await request(appWith(createViewAssetRouter({ dir })))
      .get("/assets/widgets/main-XBYE53NT.js")
      .expect(200);
    expect(res.headers.vary).toBeUndefined();
  });

  it("answers CORS preflight (OPTIONS) with 204 + allow headers", async () => {
    const res = await request(appWith(createViewAssetRouter({ dir })))
      .options("/assets/widgets/main-XBYE53NT.js")
      .expect(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
  });
});

describe("createViewAssetRouter (development / dev-proxy)", () => {
  let upstream: Server;
  let upstreamUrl: string;

  beforeEach(async () => {
    upstream = createServer((req, res) => {
      if (req.url === "/main.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end("// proxied main\n");
      } else {
        res.statusCode = 404;
        res.end("nope");
      }
    });
    await new Promise<void>((resolve) => upstream.listen(0, resolve));
    const port = (upstream.address() as AddressInfo).port;
    upstreamUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it("proxies /assets/widgets/main.js to the dev-server and re-asserts CORS", async () => {
    const app = appWith(
      createViewAssetRouter({ mode: "development", devServerUrl: upstreamUrl }),
    );
    const res = await request(app)
      .get("/assets/widgets/main.js")
      .expect(200);
    expect(res.text).toContain("proxied main");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("forwards upstream 404s", async () => {
    const app = appWith(
      createViewAssetRouter({ mode: "development", devServerUrl: upstreamUrl }),
    );
    await request(app).get("/assets/widgets/missing.js").expect(404);
  });

  it("returns 502 when the dev-server is unreachable", async () => {
    const app = appWith(
      createViewAssetRouter({
        mode: "development",
        // A port nothing is listening on.
        devServerUrl: "http://127.0.0.1:1",
      }),
    );
    await request(app).get("/assets/widgets/main.js").expect(502);
  });

  it("throws at construction for an https:// dev upstream (node:http only)", () => {
    // The minimal node:http proxy can't speak TLS; fail fast with a clear error
    // rather than producing an obscure runtime failure on the first request.
    expect(() =>
      createViewAssetRouter({
        mode: "development",
        devServerUrl: "https://localhost:4200",
      }),
    ).toThrow(/only supports http:\/\/ upstreams/);
  });
});

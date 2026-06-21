import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor, DownloadParams } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectDownload } from "./inject-download.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

const params: DownloadParams = {
  contents: [
    {
      type: "resource",
      resource: {
        uri: "file:///export.json",
        mimeType: "application/json",
        text: '{"hello":"world"}',
      },
    },
  ],
};

function makeInjector(method: ReturnType<typeof spy>): EnvironmentInjector {
  const adaptor = createFakeAdaptor({
    methods: { download: method as unknown as Adaptor["download"] },
  });
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectDownload", () => {
  it("forwards params to adaptor.download and returns its result", async () => {
    const download = spy(() => Promise.resolve({}));
    const injector = makeInjector(download);

    const { download: fn } = runInInjectionContext(injector, () =>
      injectDownload(),
    );
    const res = await fn(params);

    expect(download.calls).toEqual([[params]]);
    expect(res).toEqual({});
    injector.destroy();
  });

  it("surfaces the adaptor's { isError: true } result (host denial / unsupported)", async () => {
    const download = spy(() => Promise.resolve({ isError: true }));
    const injector = makeInjector(download);

    const { download: fn } = runInInjectionContext(injector, () =>
      injectDownload(),
    );
    const res = await fn(params);

    expect(res).toEqual({ isError: true });
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectDownload()).toThrow();
  });
});

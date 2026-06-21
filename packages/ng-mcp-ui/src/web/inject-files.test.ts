import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor, FileMetadata } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectFiles } from "./inject-files.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

const dummyFile = new File([], "test.txt");

function makeInjector(methods: Partial<Adaptor>): EnvironmentInjector {
  const adaptor = createFakeAdaptor({ methods });
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectFiles", () => {
  it("upload forwards file (no options)", () => {
    const uploadFile = spy(() => Promise.resolve({ fileId: "f1" }));
    const injector = makeInjector({
      uploadFile: uploadFile as unknown as Adaptor["uploadFile"],
    });

    const { upload } = runInInjectionContext(injector, () => injectFiles());
    upload(dummyFile);

    expect(uploadFile.calls).toEqual([[dummyFile, undefined]]);
    injector.destroy();
  });

  it("upload forwards the library option", () => {
    const uploadFile = spy(() => Promise.resolve({ fileId: "f1" }));
    const injector = makeInjector({
      uploadFile: uploadFile as unknown as Adaptor["uploadFile"],
    });

    const { upload } = runInInjectionContext(injector, () => injectFiles());
    upload(dummyFile, { library: true });

    expect(uploadFile.calls).toEqual([[dummyFile, { library: true }]]);
    injector.destroy();
  });

  it("getDownloadUrl forwards the file metadata", () => {
    const getFileDownloadUrl = spy(() =>
      Promise.resolve({ downloadUrl: "https://x/y" }),
    );
    const injector = makeInjector({
      getFileDownloadUrl:
        getFileDownloadUrl as unknown as Adaptor["getFileDownloadUrl"],
    });

    const { getDownloadUrl } = runInInjectionContext(injector, () =>
      injectFiles(),
    );
    const meta: FileMetadata = { fileId: "123" };
    getDownloadUrl(meta);

    expect(getFileDownloadUrl.calls).toEqual([[meta]]);
    injector.destroy();
  });

  it("selectFiles resolves the host's selection", async () => {
    const selected: FileMetadata[] = [
      { fileId: "file_1", fileName: "doc.pdf", mimeType: "application/pdf" },
    ];
    const selectFiles = spy(() => Promise.resolve(selected));
    const injector = makeInjector({
      selectFiles: selectFiles as unknown as Adaptor["selectFiles"],
    });

    const { selectFiles: fn } = runInInjectionContext(injector, () =>
      injectFiles(),
    );
    const files = await fn();

    expect(selectFiles.callCount()).toBe(1);
    expect(files).toEqual(selected);
    injector.destroy();
  });

  it("preserves adaptor `this` when methods are destructured", () => {
    // A stateful adaptor whose method relies on `this`. The wrapper must not
    // strip the binding when the returned functions are pulled off the object.
    class StatefulAdaptor {
      lastUploaded: File | null = null;
      uploadFile(file: File): Promise<FileMetadata> {
        this.lastUploaded = file;
        return Promise.resolve({ fileId: "ok" });
      }
    }
    const stateful = new StatefulAdaptor();
    const injector = makeInjector({
      uploadFile: ((file: File) =>
        stateful.uploadFile(file)) as Adaptor["uploadFile"],
    });

    const { upload } = runInInjectionContext(injector, () => injectFiles());
    void upload(dummyFile);
    expect(stateful.lastUploaded).toBe(dummyFile);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectFiles()).toThrow();
  });
});

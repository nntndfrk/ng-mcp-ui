import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor, RequestModalOptions } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectRequestModal } from "./inject-request-modal.js";
import { createFakeAdaptor, createFakeStore, spy } from "./test-fakes.js";

describe("injectRequestModal", () => {
  it("isOpen is false and params undefined when mode is not modal", () => {
    const display = createFakeStore<"display">({ mode: "inline" });
    const adaptor = createFakeAdaptor({ stores: { display: display.store } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { isOpen, params, open } = runInInjectionContext(injector, () =>
      injectRequestModal(),
    );
    expect(isOpen()).toBe(false);
    expect(params()).toBeUndefined();
    expect(typeof open).toBe("function");
    injector.destroy();
  });

  it("isOpen is true when mode is modal, params reflects display.params", () => {
    const testParams = { foo: "bar", baz: 42 };
    const display = createFakeStore<"display">({
      mode: "modal",
      params: testParams,
    });
    const adaptor = createFakeAdaptor({ stores: { display: display.store } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { isOpen, params } = runInInjectionContext(injector, () =>
      injectRequestModal(),
    );
    expect(isOpen()).toBe(true);
    expect(params()).toEqual(testParams);
    injector.destroy();
  });

  it("reacts to a host push that opens the modal", () => {
    const display = createFakeStore<"display">({ mode: "inline" });
    const adaptor = createFakeAdaptor({ stores: { display: display.store } });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { isOpen } = runInInjectionContext(injector, () =>
      injectRequestModal(),
    );
    expect(isOpen()).toBe(false);

    display.push({ mode: "modal" });
    expect(isOpen()).toBe(true);
    injector.destroy();
  });

  it("open() forwards options to adaptor.openModal", () => {
    const openModal = spy();
    const adaptor = createFakeAdaptor({
      methods: { openModal: openModal as unknown as Adaptor["openModal"] },
    });
    const injector = Injector.create({
      providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
    }) as EnvironmentInjector;

    const { open } = runInInjectionContext(injector, () => injectRequestModal());
    const options: RequestModalOptions = {
      title: "Test Modal",
      params: { foo: "bar" },
      template: "ui://view/modal-template.html",
    };
    open(options);

    expect(openModal.calls).toEqual([[options]]);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectRequestModal()).toThrow();
  });
});

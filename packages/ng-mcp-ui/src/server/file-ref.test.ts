import { describe, expect, it } from "vitest";
import { FileRef } from "./file-ref.js";

describe("FileRef", () => {
  it("accepts a minimal reference (id + url)", () => {
    const parsed = FileRef.parse({
      file_id: "f_1",
      download_url: "https://example.com/f_1",
    });
    expect(parsed).toEqual({
      file_id: "f_1",
      download_url: "https://example.com/f_1",
    });
  });

  it("accepts the optional mime_type and file_name fields", () => {
    const parsed = FileRef.parse({
      file_id: "f_2",
      download_url: "https://example.com/f_2",
      mime_type: "application/pdf",
      file_name: "report.pdf",
    });
    expect(parsed).toMatchObject({
      mime_type: "application/pdf",
      file_name: "report.pdf",
    });
  });

  it("rejects a reference missing required fields", () => {
    expect(() => FileRef.parse({ file_id: "f_3" })).toThrow();
  });
});

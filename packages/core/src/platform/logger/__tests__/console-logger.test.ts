import { describe, expect, it, vi, beforeEach } from "vitest";

import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";

describe("makeConsoleLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("warn", () => {
    it("calls console.warn with only the message when no context is provided", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();

      logger.warn("something degraded");

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("something degraded");
    });

    it("calls console.warn with message and context when context is provided", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();

      logger.warn("cache miss", { mediaId: "abc-123" });

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("cache miss", { mediaId: "abc-123" });
    });
  });

  describe("error", () => {
    it("calls console.error with only the message when no context is provided", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();

      logger.error("fetch failed");

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("fetch failed");
    });

    it("calls console.error with message and context when context is provided", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();

      logger.error("db write failed", { table: "media", id: "xyz" });

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("db write failed", { table: "media", id: "xyz" });
    });
  });

  describe("info", () => {
    it("calls console.log when info is invoked", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();

      logger.info?.("job started");

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("job started");
    });
  });

  describe("logAndSwallow", () => {
    it("logs the error message and swallows the error for Error instances", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();
      const handler = logger.logAndSwallow("media:extras");

      const err = new Error("timeout");
      handler(err);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("[media:extras]", "timeout");
    });

    it("logs non-Error values as-is", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();
      const handler = logger.logAndSwallow("queue:dispatch");

      handler("string error");

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("[queue:dispatch]", "string error");
    });

    it("does not throw even when the error is thrown inside the handler", () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logger = makeConsoleLogger();
      const handler = logger.logAndSwallow("safe:scope");

      expect(() => handler(new Error("boom"))).not.toThrow();
    });
  });
});

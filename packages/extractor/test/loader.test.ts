import { describe, expect, test } from "vitest";
import { loadThreads } from "@openloop-bench/corpus";
import { loadForExtraction } from "../src/loader.js";

const GROUND_TRUTH_KEYS = new Set(["loops", "notes", "split", "batch"]);

function objectKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.keys(value);
}

describe("loadForExtraction", () => {
  test("returns only model-visible structure for every thread", () => {
    const { loaded, failures } = loadThreads();
    expect(failures).toEqual([]);

    for (const { thread } of loaded) {
      const extracted = loadForExtraction(thread.thread_id);
      expect(Object.keys(extracted).sort(), thread.thread_id).toEqual(["channel", "messages", "thread_id"]);
      expect(extracted.thread_id, thread.thread_id).not.toMatch(/^(del|en|mix|neg|sup)-/);

      for (const key of objectKeys(extracted)) {
        expect(GROUND_TRUTH_KEYS.has(key), `${thread.thread_id}.${key}`).toBe(false);
      }
      for (const message of extracted.messages) {
        expect(Object.keys(message).sort(), `${thread.thread_id}.messages.${message.index}`).toEqual([
          "index",
          "sender",
          "text",
          "ts",
        ]);
        for (const key of objectKeys(message)) {
          expect(GROUND_TRUTH_KEYS.has(key), `${thread.thread_id}.messages.${message.index}.${key}`).toBe(false);
        }
      }
    }
  });
});

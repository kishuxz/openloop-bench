import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  CorpusSchema,
  formatIssues,
  type Channel,
  type Message,
  type Split,
  type Thread,
} from "@openloop-bench/schema";
import {
  THREADS_DIR,
  corpusHash,
  filenameMismatch,
  loadThreads,
  type LoadedThread,
} from "@openloop-bench/corpus";

export interface ExtractionThread {
  readonly thread_id: string;
  readonly channel: Channel;
  readonly messages: readonly Message[];
}

export interface ExtractionThreadRecord {
  readonly originalThreadId: string;
  readonly opaqueThreadId: string;
  readonly thread: ExtractionThread;
}

export interface ValidatedCorpus {
  readonly loaded: readonly LoadedThread[];
  readonly corpusHash: string;
}

function validationError(failures: readonly { file: string; problems: readonly string[] }[]): Error {
  const detail = failures.map((f) => `${f.file}: ${f.problems.join("; ")}`).join("\n  ");
  return new Error(`extractor refuses to run against a corpus that does not validate:\n  ${detail}`);
}

export function opaqueThreadId(threadId: string): string {
  const hash = createHash("sha256").update(`openloop-extraction:${threadId}`).digest("hex").slice(0, 12);
  return `thread-${hash}`;
}

export function loadValidatedCorpus(dir: string = THREADS_DIR): ValidatedCorpus {
  const { loaded, failures } = loadThreads(dir);
  const problems = [...failures];

  for (const item of loaded) {
    const mismatch = filenameMismatch(item.file, item.thread);
    if (mismatch) problems.push({ file: item.file, problems: [mismatch] });
  }

  const corpus = CorpusSchema.safeParse(loaded.map((l) => l.thread));
  if (!corpus.success) problems.push({ file: "(corpus)", problems: formatIssues(corpus.error) });

  if (problems.length > 0) throw validationError(problems);
  return { loaded, corpusHash: corpusHash(dir) };
}

function extractionThread(thread: Thread): ExtractionThread {
  return {
    thread_id: opaqueThreadId(thread.thread_id),
    channel: thread.channel,
    messages: thread.messages.map((message) => ({ ...message })),
  };
}

export function loadForExtraction(threadId: string, dir: string = THREADS_DIR): ExtractionThread {
  const { loaded } = loadValidatedCorpus(dir);
  const match = loaded.find((item) => basename(item.file, ".json") === threadId || item.thread.thread_id === threadId);
  if (!match) throw new Error(`thread "${threadId}" not found`);
  return extractionThread(match.thread);
}

export function loadSplitForExtraction(split: Split, dir: string = THREADS_DIR): {
  readonly corpusHash: string;
  readonly records: readonly ExtractionThreadRecord[];
} {
  const validated = loadValidatedCorpus(dir);
  return {
    corpusHash: validated.corpusHash,
    records: validated.loaded
      .map((item) => item.thread)
      .filter((thread) => thread.split === split)
      .map((thread) => {
        const threadForModel = extractionThread(thread);
        return {
          originalThreadId: thread.thread_id,
          opaqueThreadId: threadForModel.thread_id,
          thread: threadForModel,
        };
      }),
  };
}

import { SplitSchema, type Split } from "@openloop-bench/schema";
import { DEFAULT_CONFIGS, extract } from "../runner.js";
import { isConfigName, type ExtractorConfigName } from "../config.js";

interface Args {
  readonly split: Split;
  readonly configs: readonly ExtractorConfigName[];
  readonly noCache: boolean;
  readonly final: boolean;
}

function usage(): string {
  return [
    "Usage: pnpm extract --split dev|test [--config hosted-large|hosted-redacted|local] [--no-cache] [--final]",
    "",
    "By default all three configs run. Test split requires --final and no existing predictions/*-test*.json file.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): Args {
  let split: Split | null = null;
  const configs: ExtractorConfigName[] = [];
  let noCache = false;
  let final = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--split") {
      const value = argv[++i];
      const parsed = SplitSchema.safeParse(value);
      if (!parsed.success) throw new Error(`invalid --split "${value ?? ""}"\n${usage()}`);
      split = parsed.data;
    } else if (arg === "--config") {
      const value = argv[++i];
      if (!value || !isConfigName(value)) throw new Error(`invalid --config "${value ?? ""}"\n${usage()}`);
      configs.push(value);
    } else if (arg === "--no-cache") {
      noCache = true;
    } else if (arg === "--final") {
      final = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument "${arg ?? ""}"\n${usage()}`);
    }
  }

  if (!split) throw new Error(`missing --split\n${usage()}`);
  return { split, configs: configs.length > 0 ? configs : DEFAULT_CONFIGS, noCache, final };
}

try {
  await extract(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}

import fsp from "fs/promises";
import path from "path";
import { Command } from "commander";
import { globSync } from "glob";
import { CsvCompression, compressionOf } from "../data/csvReader";
import { prunedFileName, scanColumns, selectColumns, writePrunedFile } from "../data/prune";
import { UserError } from "../utils";

type PruneOptions = {
  outDir: string | null;
  inPlace: boolean;
  keepOnlyCharted: boolean;
  compress: CsvCompression | null;
  dryRun: boolean;
};

const formatBytes = (bytes: number): string =>
  bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

async function prune(files: string[], options: PruneOptions): Promise<void> {
  console.log(`Scanning ${files.length} file(s) for columns that are zero in every file...`);
  const scan = await scanColumns(files);
  const selection = selectColumns(scan, options.keepOnlyCharted);
  console.log(
    `Keeping ${selection.keep.length} of ${scan.columns.length} columns ` +
    `(dropping ${selection.droppedZero.length} that are zero in every file` +
    `${options.keepOnlyCharted ? ` and ${selection.droppedNotCharted.length} that no chart reads` : ""}).`,
  );
  if (options.dryRun) {
    console.log("Dry run, nothing written. Dropped:", [...selection.droppedZero, ...selection.droppedNotCharted].join(", "));
    return;
  }

  for (const file of files) {
    const compression = options.compress ?? compressionOf(file);
    const destinationDir = options.outDir ? path.resolve(options.outDir) : path.dirname(path.resolve(file));
    const destination = path.join(destinationDir, prunedFileName(file, compression));
    const sameFile = path.resolve(file) === destination;
    if (sameFile && !options.inPlace) {
      throw new UserError(`${file} would be overwritten; use --out-dir, or --in-place to replace the files`);
    }
    await fsp.mkdir(destinationDir, { recursive: true });
    // Write beside the target first so an interrupted run never leaves a truncated results file.
    const temporary = `${destination}.pruning`;
    const before = (await fsp.stat(file)).size;
    const after = await writePrunedFile(file, temporary, selection.keep, compression);
    await fsp.rename(temporary, destination);
    // In place with a changed name (e.g. compressing): the original is replaced, not kept.
    if (options.inPlace && !sameFile) await fsp.rm(file);
    console.log(`${path.basename(file)} -> ${path.relative(process.cwd(), destination) || destination}: ${formatBytes(before)} -> ${formatBytes(after)}`);
  }
}

export function createPruneCommand(): Command {
  return new Command("prune")
    .description("Drop columns that are zero in every file (and optionally the columns no chart reads) from results files, and optionally compress them. Every chart renders the same afterwards")
    .argument("<glob-pattern>", "Glob pattern for results files (.csv, .csv.gz, .csv.zst), e.g. './results/*.csv'")
    .option("--out-dir <dir>", "Write the pruned files to this directory (the originals stay)")
    .option("--in-place", "Replace the files where they are", false)
    .option("--keep-only-charted", "Also drop columns the chart commands do not read: keep tick, run, wholeUpdate, the summary categories, entityUpdate and the entity types", false)
    .option(
      "--compress <gz|zst|none>",
      "Write .csv.gz, .csv.zst or plain .csv (default: the compression each input already has)",
      (it: string) => {
        if (it === "gz" || it === "zst" || it === "none") return it;
        throw new UserError(`Invalid --compress value: ${it}. Must be one of gz, zst, none.`);
      },
    )
    .option("--dry-run", "Only report which columns would be dropped", false)
    .action(async (pattern: string, opts: any) => {
      const options: PruneOptions = {
        outDir: opts.outDir ?? null,
        inPlace: opts.inPlace ?? false,
        keepOnlyCharted: opts.keepOnlyCharted ?? false,
        compress: opts.compress ?? null,
        dryRun: opts.dryRun ?? false,
      };
      if (!options.dryRun && !options.outDir && !options.inPlace) {
        throw new UserError("Choose where to write: --out-dir <dir> (originals stay) or --in-place (replace the files)");
      }
      if (options.outDir && options.inPlace) {
        throw new UserError("Use either --out-dir or --in-place, not both");
      }
      const files = globSync(pattern);
      if (files.length === 0) {
        console.error(`No files matched the given pattern ${pattern}`);
        process.exit(1);
      }
      await prune(files, options);
    });
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { warnUnmatchedGroups } from "../commands/utils";

describe("warnUnmatchedGroups", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  const printed = (): string[] => (warn.mock.calls as unknown[][]).map((call) => String(call[0]));
  const files = ["results/a-fast_verbose_metrics.csv", "results/a-slow_verbose_metrics.csv"];

  it("is silent when every key has a file", () => {
    warnUnmatchedGroups(files, ["fast", "slow"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is silent without group keys", () => {
    warnUnmatchedGroups(files, []);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns for each key that matches no file, naming the base names", () => {
    warnUnmatchedGroups(files, ["fast", "Slow", "medium"]);
    const messages = printed();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('--group-by: key "Slow" did not match any input file');
    expect(messages[0]).toContain("a-fast, a-slow");
    expect(messages[1]).toContain('key "medium" did not match any input file');
  });

  it("matches against the base name, not a label from a names file", () => {
    // The labels "Fast" and "Slow" are not in the file names.
    warnUnmatchedGroups(files, ["Fast", "Slow"]);
    const messages = printed();
    expect(messages.some((m: string) => m.includes('key "Fast"'))).toBe(true);
    expect(messages.some((m: string) => m.includes('key "Slow"'))).toBe(true);
  });

  it("warns when grouping leaves no rows at all", () => {
    warnUnmatchedGroups(files, ["Fast", "Slow"]);
    const messages = printed();
    expect(messages).toHaveLength(3);
    expect(messages[2]).toContain("no input file matched any key");
  });

  it("does not warn about no rows when at least one key matches", () => {
    warnUnmatchedGroups(files, ["fast", "medium"]);
    const messages = printed();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('key "medium"');
  });

  it("explains a key that only matches files a longer key takes", () => {
    warnUnmatchedGroups(["q2_lds_verbose_metrics.csv"], ["q2", "q2_lds"]);
    const messages = printed();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('key "q2" only matched files that a longer key takes');
  });

  it("counts a base name once however many inputs carry it", () => {
    warnUnmatchedGroups(["a/x_verbose_metrics.csv", "b/x_verbose_metrics.csv"], ["x"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import { buildChartInvocations } from "../commands/render";
import { UserError } from "../utils";

const dir = path.resolve("/work/bench");
const abs = (p: string) => path.resolve(dir, p);

const build = (config: unknown) => buildChartInvocations(config, dir);

describe("buildChartInvocations", () => {
  it("merges defaults under each chart's own settings, in command-line form", () => {
    const [ups, summary] = build({
      defaults: { width: 1200, removeFirstTicks: 1500, summaryTableFile: false },
      charts: [
        { command: "ups", input: "results/*.csv", output: "charts/ups.png" },
        { command: "summary", input: "results/*.csv", output: "charts/summary.png", width: 800 },
      ],
    });
    expect(ups.command).toBe("ups");
    expect(ups.argv).toEqual([
      "--input", abs("results/*.csv"),
      "--width", "1200", "--remove-first-ticks", "1500", "--summary-table-file", "false",
      "--output", abs("charts/ups.png"),
    ]);
    expect(summary.argv).toContain("800");
    expect(summary.argv).not.toContain("1200");
  });

  it("accepts camelCase and kebab-case option names", () => {
    const [chart] = build({ charts: [{ command: "ups", input: "a/*.csv", output: "o.png", "remove-first-ticks": 5, titleOverride: "T" }] });
    expect(chart.argv).toEqual(expect.arrayContaining(["--remove-first-ticks", "5", "--title-override", "T"]));
  });

  it("resolves paths relative to the config file, but not absolute ones", () => {
    const [chart] = build({
      defaults: { namesFile: "names.txt", aggregateFile: "/abs/results.csv" },
      charts: [{ command: "ups", input: "a/*.csv", output: "out/ups.png" }],
    });
    expect(chart.argv).toEqual(expect.arrayContaining(["--names-file", abs("names.txt"), "--aggregate-file", "/abs/results.csv", "--output", abs("out/ups.png")]));
  });

  it("turns each input into an --input, with suffixes in either form", () => {
    const [chart] = build({
      charts: [{
        command: "summary",
        input: ["malloc/*.csv:malloc", { path: "mimalloc/*.csv", suffix: "mimalloc" }, "plain/*.csv"],
        output: "o.png",
      }],
    });
    expect(chart.argv.slice(0, 6)).toEqual(["--input", `${abs("malloc/*.csv")}:malloc`, "--input", `${abs("mimalloc/*.csv")}:mimalloc`, "--input", abs("plain/*.csv")]);
  });

  it("handles flags, comma lists, repeatable options and name maps", () => {
    const [chart] = build({
      charts: [{
        command: "summary", input: "a/*.csv", output: "o.png",
        valueLabels: true, paired: false, metrics: ["wholeUpdate", "entityUpdate"], groupBy: ["q1", "q2"],
        trimSubstring: ["_a", "_b"], name: { one: "Design One", two: "Design Two" },
      }],
    });
    expect(chart.argv).toEqual(expect.arrayContaining([
      "--value-labels", "--metrics", "wholeUpdate,entityUpdate", "--group-by", "q1,q2",
      "--trim-substring", "_a", "--trim-substring", "_b", "--name", "one=Design One", "--name", "two=Design Two",
    ]));
    expect(chart.argv).not.toContain("--paired");
  });

  it("skips defaults the command has no such option for, but rejects them on a chart", () => {
    const [chart] = build({ defaults: { topN: 5 }, charts: [{ command: "ups", input: "a/*.csv", output: "o.png" }] });
    expect(chart.argv).not.toContain("--top-n");
    expect(() => build({ charts: [{ command: "ups", input: "a/*.csv", output: "o.png", topN: 5 }] })).toThrow(/"top-n" is not an option of ups/);
  });

  it("describes each chart for progress messages", () => {
    expect(build({ charts: [{ command: "boxplot", input: "a/*.csv", output: "charts/box.png" }] })[0].label).toBe("boxplot -> charts/box.png");
  });

  it("explains a bad config", () => {
    expect(() => build(null)).toThrow(UserError);
    expect(() => build({ charts: [] })).toThrow(/non-empty "charts"/);
    expect(() => build({ charts: [{ input: "a", output: "o" }] })).toThrow(/needs a "command"/);
    expect(() => build({ charts: [{ command: "pie", input: "a", output: "o" }] })).toThrow(/unknown command "pie"/);
    expect(() => build({ charts: [{ command: "ups", output: "o.png" }] })).toThrow(/no "input"/);
    expect(() => build({ charts: [{ command: "ups", input: "a/*.csv" }] })).toThrow(/no "output"/);
    expect(() => build({ defaults: 3, charts: [{ command: "ups", input: "a", output: "o" }] })).toThrow(/"defaults" must be an object/);
    expect(() => build({ charts: [{ command: "ups", input: [3], output: "o" }] })).toThrow(/each input must be/);
  });
});

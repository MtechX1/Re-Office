import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function readTree(root: string): string {
  return walk(root)
    .filter((file) => !file.includes(`${path.sep}allowlist.ts`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

describe("viewer policy", () => {
  it("does not name KVCore or offer a dial action", () => {
    const corpus = ["src", "docs", "public", "README.md"]
      .map((entry) => {
        const full = path.join(process.cwd(), entry);
        return statSync(full).isDirectory() ? readTree(full) : readFileSync(full, "utf8");
      })
      .join("\n");
    expect(corpus.toLowerCase()).not.toContain("kvcore");
    expect(corpus.toLowerCase()).not.toContain("auto-dial");
    expect(corpus.toLowerCase()).not.toContain("start dialing");
    expect(corpus.toLowerCase()).not.toContain("automated dialer");
  });

  it("keeps excluded roster names out of the rendered office and does not auto-open links", () => {
    const visible = readTree(path.join(process.cwd(), "src/components")) + readTree(path.join(process.cwd(), "src/app"));
    for (const name of [
      "Signal Prospector",
      "Clip Bot",
      "Visuals Bot",
      "Pipeline Pulse",
      "Stavy's Re Closer",
      "Transaction Bot",
      "Hollywood Bot",
      "RE HQ Coordinator",
      "63630cda-0d74-428a-a066-f5ae66bbcba3",
    ]) {
      expect(visible).not.toContain(name);
    }
    expect(visible).not.toContain("dangerouslySetInnerHTML");
    expect(visible).not.toContain("window.open");
    expect(visible).not.toContain("<a ");
    expect(readFileSync(path.join(process.cwd(), "public/consume-topic.js"), "utf8")).not.toContain("console.");
  });
});

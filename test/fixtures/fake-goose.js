#!/usr/bin/env node
// Stands in for the goose CLI in tests. Checks the safety flags, then prints a fixed answer.
const args = process.argv.slice(2);
const required = ["run", "--no-session", "--no-profile", "--quiet", "--text"];
const missing = required.filter((flag) => !args.includes(flag));
if (missing.length) {
  console.error(`missing flags: ${missing.join(", ")}`);
  process.exit(2);
}
if (process.env.GOOSE_MODE !== "chat") process.exit(3);
if (Object.keys(process.env).some((k) => k.startsWith("DISCORD_"))) process.exit(4);
console.log("flags ok");

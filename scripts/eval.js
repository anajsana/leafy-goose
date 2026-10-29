// Run the test questions through goose without Discord
//   npm run eval                  all questions
//   npm run eval -- -v            also print every answer
//   npm run eval -- unconference  only questions containing "unconference"
require("dotenv").config();
const guideLib = require("../lib/guide");
const cases = require("../test/eval-questions.json");

const verbose = process.argv.includes("-v");
const filter = (process.argv.slice(2).find((a) => !a.startsWith("-")) || "").toLowerCase();

(async () => {
  const guide = guideLib.loadGuide();
  const selected = cases.filter((c) => c.question.toLowerCase().includes(filter));
  let failed = 0;

  for (const c of selected) {
    const problems = [];
    let result;
    try {
      result = guideLib.checkAnswer(await guideLib.askGoose(guide, c.question), guide);
    } catch (error) {
      console.log(`ERROR  ${c.question}\n       ${error.message}`);
      failed++;
      continue;
    }
    const answer = (result.answer || "").toLowerCase();

    if (c.expectNoAnswer) {
      if (result.answer) problems.push("expected NO_ANSWER, got an answer");
    } else {
      if (!result.answer) problems.push(`got NO_ANSWER (${result.noAnswerReason})`);
      for (const t of c.mustInclude || []) if (!answer.includes(t.toLowerCase())) problems.push(`missing: ${t}`);
      problems.push(...result.warnings.filter((w) => !w.startsWith("The guide was last reviewed")));
    }
    for (const t of c.mustNotInclude || []) if (answer.includes(t.toLowerCase())) problems.push(`should not contain: ${t}`);

    console.log(`${problems.length ? "FAIL" : "PASS"}   ${c.question}`);
    for (const p of problems) console.log(`       - ${p}`);
    if (verbose || problems.length) {
      const shown = result.answer || `NO_ANSWER: ${result.noAnswerReason}`;
      console.log(`       ${shown.replace(/\n/g, "\n       ")}`);
    }
    if (problems.length) failed++;
  }
  console.log(`\n${selected.length - failed}/${selected.length} passed`);
  process.exit(failed ? 1 : 0);
})();

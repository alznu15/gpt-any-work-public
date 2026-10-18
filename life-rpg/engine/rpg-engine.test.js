"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("./rpg-engine.js");

test("character level uses increasing thresholds", () => {
  assert.equal(engine.calculateLevel(0).level, 1);
  assert.equal(engine.calculateLevel(100).level, 2);
  assert.equal(engine.calculateLevel(249).level, 2);
  assert.equal(engine.calculateLevel(250).level, 3);
});

test("XP is formula-derived and evidence changes reward", () => {
  const weak = engine.calculateSessionReward({ focusMinutes: 60, difficulty: 1, evidenceLevel: "self_report", skillId: "math" });
  const strong = engine.calculateSessionReward({ focusMinutes: 60, difficulty: 4, evidenceLevel: "scored", skillId: "math" });
  assert.ok(strong.characterXp > weak.characterXp);
  assert.ok(strong.skillXp > weak.skillXp);
});

test("duplicate session cannot award twice", () => {
  assert.equal(engine.calculateSessionReward({ focusMinutes: 60, alreadyCredited: true }).characterXp, 0);
});

test("difficulty index is weighted and bounded", () => {
  const result = engine.calculateDifficultyIndex({
    prerequisiteKnowledge: 5, reasoningDepth: 5, transferNovelty: 5, timePressure: 5, breadth: 5
  });
  assert.equal(result.index, 100);
  assert.equal(engine.calculateDifficultyIndex({}).index, 0);
});

test("official eligibility remains separate from readiness", () => {
  const result = engine.evaluateDungeonGate(
    { skills: { algebra: { verifiedLevel: 3, latestScorePercent: 80, lastAssessedAt: "2026-10-01" } } },
    { eligibilityStatus: "eligible", requiredSkills: [{ skillId: "algebra", minVerifiedLevel: 4, minScorePercent: 70, maxAssessmentAgeDays: 90 }] },
    "2026-10-18"
  );
  assert.equal(result.eligibility, "eligible");
  assert.equal(result.readiness, "preparation_recommended");
});

test("ineligible candidates are never marked ready", () => {
  const result = engine.evaluateDungeonGate({}, { eligibilityStatus: "ineligible" }, "2026-10-18");
  assert.equal(result.eligibility, "ineligible");
  assert.notEqual(result.readiness, "ready");
});

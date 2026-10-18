(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LifeRpgEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIFFICULTY_MULTIPLIERS = Object.freeze({
    1: 0.65, 2: 0.80, 3: 1.00, 4: 1.25, 5: 1.50
  });
  const EVIDENCE_MULTIPLIERS = Object.freeze({
    self_report: 0.50,
    artifact: 1.00,
    scored: 1.15,
    independently_verified: 1.25
  });
  const DIFFICULTY_WEIGHTS = Object.freeze({
    prerequisiteKnowledge: 25,
    reasoningDepth: 25,
    transferNovelty: 20,
    timePressure: 15,
    breadth: 15
  });

  function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function calculateLevel(totalXp, baseXp, growthXp) {
    let remaining = Math.max(0, finiteNumber(totalXp, 0));
    const base = Math.max(1, finiteNumber(baseXp, 100));
    const growth = Math.max(0, finiteNumber(growthXp, 50));
    let level = 1;
    let required = base;
    while (remaining >= required && level < 10000) {
      remaining -= required;
      level += 1;
      required = base + growth * (level - 1);
    }
    return {
      level: level,
      xpIntoLevel: Math.floor(remaining),
      xpToNext: Math.round(required),
      progress: Math.min(1, Math.max(0, remaining / required))
    };
  }

  function calculateSessionReward(input) {
    const data = input || {};
    if (data.alreadyCredited === true) {
      return { characterXp: 0, skillXp: 0, reason: "session_already_credited" };
    }
    const minutes = Math.max(0, Math.min(24 * 60, finiteNumber(data.focusMinutes, 0)));
    const difficulty = Math.max(1, Math.min(5, Math.round(finiteNumber(data.difficulty, 3))));
    const evidence = EVIDENCE_MULTIPLIERS[data.evidenceLevel] ? data.evidenceLevel : "self_report";
    const completionRatio = Math.max(0, Math.min(1, finiteNumber(data.completionRatio, 1)));
    const multiplier = DIFFICULTY_MULTIPLIERS[difficulty];
    const proofMultiplier = EVIDENCE_MULTIPLIERS[evidence];
    const effectiveMinutes = minutes * completionRatio;
    return {
      characterXp: Math.round((effectiveMinutes / 15) * 8 * multiplier * proofMultiplier),
      skillXp: data.skillId ? Math.round((effectiveMinutes / 15) * 6 * multiplier * proofMultiplier) : 0,
      creditedMinutes: minutes,
      difficulty: difficulty,
      evidenceLevel: evidence,
      note: "XP 由有效專注時間、難度和證據等級計算；已驗證技能等級需另行通過能力驗收。"
    };
  }

  function calculateDifficultyIndex(dimensions) {
    const values = dimensions || {};
    let total = 0;
    const breakdown = {};
    Object.keys(DIFFICULTY_WEIGHTS).forEach(function (key) {
      const rating = Math.max(0, Math.min(5, finiteNumber(values[key], 0)));
      const points = (rating / 5) * DIFFICULTY_WEIGHTS[key];
      breakdown[key] = Math.round(points * 10) / 10;
      total += points;
    });
    return {
      index: Math.round(total),
      max: 100,
      breakdown: breakdown,
      ratingType: values.ratingType || "provisional",
      note: "競爭選拔性與官方資格需分開計算，不包含在認知挑戰指數內。"
    };
  }

  function evaluateDungeonGate(profile, dungeon, nowValue) {
    const p = profile || {};
    const d = dungeon || {};
    const eligibility = d.eligibilityStatus || "verify";
    if (eligibility === "ineligible") {
      return { eligibility: "ineligible", readiness: "not_ready", reasons: ["官方資格條件不符合"] };
    }
    if (eligibility !== "eligible") {
      return { eligibility: "verify", readiness: "pending_verification", reasons: ["先核實年級、年齡、地區、隊伍與報名規則"] };
    }

    const skills = p.skills || {};
    const requirements = d.requiredSkills || [];
    const missingBy = [];
    const lowScore = [];
    const stale = [];
    let minimumSurplus = Infinity;
    const now = nowValue ? new Date(nowValue) : new Date();

    requirements.forEach(function (req) {
      const actual = skills[req.skillId] || {};
      const level = Math.max(0, finiteNumber(actual.verifiedLevel, 0));
      const target = Math.max(0, finiteNumber(req.minVerifiedLevel, 0));
      const surplus = level - target;
      minimumSurplus = Math.min(minimumSurplus, surplus);
      if (surplus < 0) missingBy.push({ skillId: req.skillId, levels: -surplus });
      if (req.minScorePercent !== undefined && finiteNumber(actual.latestScorePercent, -1) < req.minScorePercent) {
        lowScore.push(req.skillId);
      }
      const assessedAt = actual.lastAssessedAt ? new Date(actual.lastAssessedAt) : null;
      const maxAgeDays = Math.max(1, finiteNumber(req.maxAssessmentAgeDays, 90));
      if (!assessedAt || Number.isNaN(assessedAt.getTime()) ||
          (now.getTime() - assessedAt.getTime()) > maxAgeDays * 86400000) {
        stale.push(req.skillId);
      }
    });

    const largeGaps = missingBy.filter(function (item) { return item.levels > 1; });
    if (largeGaps.length) {
      return { eligibility: "eligible", readiness: "locked_by_prerequisite_gap", reasons: ["至少一項先備技能低於需求兩級或以上"], missingBy: missingBy, staleSkills: stale, lowScoreSkills: lowScore };
    }
    if (missingBy.length || lowScore.length) {
      return { eligibility: "eligible", readiness: "preparation_recommended", reasons: ["技能等級或最近測驗證據尚未達門檻"], missingBy: missingBy, staleSkills: stale, lowScoreSkills: lowScore };
    }
    if (stale.length) {
      return { eligibility: "eligible", readiness: "assessment_needed", reasons: ["至少一項能力評量超過有效期限或尚無評量"], staleSkills: stale };
    }
    return {
      eligibility: "eligible",
      readiness: minimumSurplus >= 2 ? "ready_stretch" : "ready",
      reasons: minimumSurplus >= 2 ? ["全部技能達門檻，且最低餘裕至少兩級"] : ["技能門檻與近期評量均符合"],
      staleSkills: [],
      lowScoreSkills: [],
      missingBy: []
    };
  }

  return Object.freeze({
    difficultyMultipliers: DIFFICULTY_MULTIPLIERS,
    evidenceMultipliers: EVIDENCE_MULTIPLIERS,
    difficultyWeights: DIFFICULTY_WEIGHTS,
    calculateLevel: calculateLevel,
    calculateSessionReward: calculateSessionReward,
    calculateDifficultyIndex: calculateDifficultyIndex,
    evaluateDungeonGate: evaluateDungeonGate
  });
});

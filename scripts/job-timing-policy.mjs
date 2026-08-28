const explicitCompatible2027 = /\b(?:class\s+of\s+2027|(?:spring|summer|fall|winter)\s+2027|2027\s+(?:start|graduate|grad|cohort)|(?:(?:new|college|university)\s+)?grad(?:uate)?\b[^.!?;]{0,35}\b2027|(?:start(?:ing)?|begin(?:ning)?|available|graduate(?:d|s|ing)?|graduation|cohort|graduate\s+(?:program|programme|role|position))\b[^.!?;]{0,35}\b2027)\b/i;
const explicitIncompatibleCycle = /\b(?:class\s+of\s+202[56]|(?:spring|summer|fall|winter)\s+202[56]|202[56]\s+(?:start|graduate|grad|cohort)|(?:(?:new|college|university)\s+)?grad(?:uate)?\b[^.!?;]{0,35}\b202[56]|(?:start(?:ing)?|begin(?:ning)?|available|graduate(?:d|s|ing)?|graduation|cohort|graduate\s+(?:program|programme|role|position))\b[^.!?;]{0,35}\b202[56])\b/i;
const earlyCareerSignal = /\b(?:new\s*grad(?:uate)?|recent\s+grad(?:uate)?|early\s+career|entry[- ]level|campus\s+hire|university\s+graduate|graduate\s+(?:program|programme|role|position)|junior)\b/i;
const compatibleExperience = /\b(?:0\s*[-–]\s*[0123]|[012]\+?|up\s+to\s+[123]|less\s+than\s+[123])\s+years?\b/i;
const fullTimeSignal = /\b(?:full[- ]time|permanent)\b/i;
const internshipSignal = /\b(?:intern(?:ship)?|co[- ]?op)\b/i;

export function classifyTimingEvidence({
  title = "",
  description = "",
  employmentType = "",
  startDate = "",
} = {}) {
  const combined = `${title} ${description} ${employmentType} ${startDate}`.replace(/\s+/g, " ");
  const has2027 = explicitCompatible2027.test(combined);
  const hasIncompatibleCycle = explicitIncompatibleCycle.test(combined) && !has2027;

  if (hasIncompatibleCycle) {
    return {
      status: "exclude",
      reasonCode: "timing-incompatible-explicit-cycle",
      confirmed2027: false,
    };
  }

  if (has2027) {
    return {
      status: "confirmed-2027",
      reasonCode: "explicit-2027-evidence",
      confirmed2027: true,
    };
  }

  const isInternship = internshipSignal.test(`${title} ${employmentType}`);
  const isFullTime = fullTimeSignal.test(`${title} ${employmentType}`) || !isInternship;
  const isCompatibleEarlyCareer = earlyCareerSignal.test(combined) || compatibleExperience.test(combined);
  if (isFullTime && isCompatibleEarlyCareer) {
    return {
      status: "timing-check",
      reasonCode: "compatible-early-career-timing-unconfirmed",
      confirmed2027: false,
    };
  }

  return {
    status: "needs-review",
    reasonCode: "insufficient-start-timing-evidence",
    confirmed2027: false,
  };
}

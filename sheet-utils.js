function buildSheetGidCandidates(knownGids = []) {
  const candidates = new Set();

  knownGids.forEach((gid) => {
    if (!gid) return;
    candidates.add(String(gid));

    const numericGid = parseInt(gid, 10);
    if (Number.isNaN(numericGid)) return;

    for (let offset = -20; offset <= 20; offset += 1) {
      const adjusted = numericGid + offset;
      if (adjusted > 0) {
        candidates.add(String(adjusted));
      }
    }
  });

  candidates.add('0');

  for (let i = 1; i <= 120; i += 1) {
    candidates.add(String(i));
  }

  return Array.from(candidates).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

module.exports = {
  buildSheetGidCandidates
};

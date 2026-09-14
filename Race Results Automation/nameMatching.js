/*
 * Centralized member-name normalization & matching.
 * Replaces the repeated trim().toLowerCase() comparisons that were
 * previously duplicated (and inconsistently keyed) across appendRound,
 * appendHCRound, ensureMembersInOverall, and findMemberByClassAndSail.
 */
function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Finds an item in `list` whose `key` property matches `name` (normalized).
 * Returns the matched item, or null if not found.
 */
function findByName(list, name, key) {
  const target = normalizeName(name);
  if (!target) return null;
  return list.find(item => normalizeName(item[key]) === target) || null;
}

/**
 * Returns a boolean list of names (already normalized) for cheap membership checks,
 * e.g. checking whether a sheet already contains a given member.
 */
function toNormalizedNameSet(list, key) {
  return new Set(list.map(item => normalizeName(key ? item[key] : item)));
}


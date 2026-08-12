const BAND_LEADER = "band leader";
const BAND_MEMBER = "band member";

function normalizeMinistry(value: string) {
  return value.trim().toLowerCase();
}

export function getDisplayedMinistries(ministries: string[], role?: string | null) {
  const isBandLeader = role === "band_leader"
    || ministries.some((ministry) => normalizeMinistry(ministry) === BAND_LEADER);

  if (!isBandLeader) return ministries;

  return ministries.filter((ministry) => normalizeMinistry(ministry) !== BAND_MEMBER);
}

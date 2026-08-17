export interface LeadershipRoleDefinition {
  key: string;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  iconEmoji: string;
  badgeClass: string;
}

export const LEADERSHIP_ROLES: LeadershipRoleDefinition[] = [
  {
    key: "worship_team_chairman",
    label: "Worship Team Chairman",
    shortLabel: "Chairman",
    badgeLabel: "Worship Team Chairman",
    iconEmoji: "👑",
    badgeClass: "border-amber-400/40 bg-amber-400/15 text-amber-200 shadow-sm",
  },
  {
    key: "worship_leader",
    label: "Worship Leader",
    shortLabel: "Worship Leader",
    badgeLabel: "Worship Leader",
    iconEmoji: "⭐",
    badgeClass: "border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-sm",
  },
  {
    key: "band_leader",
    label: "Band Leader / Music Director",
    shortLabel: "Band Leader",
    badgeLabel: "Band Leader",
    iconEmoji: "🎵",
    badgeClass: "border-blue-400/40 bg-blue-500/15 text-blue-200 shadow-sm",
  },
  {
    key: "vocal_director",
    label: "Vocal Director",
    shortLabel: "Vocal Director",
    badgeLabel: "Vocal Director",
    iconEmoji: "🎤",
    badgeClass: "border-pink-400/40 bg-pink-500/15 text-pink-200 shadow-sm",
  },
  {
    key: "dance_leader",
    label: "Dance Leader",
    shortLabel: "Dance Leader",
    badgeLabel: "Dance Leader",
    iconEmoji: "💃",
    badgeClass: "border-rose-400/40 bg-rose-500/15 text-rose-200 shadow-sm",
  },
  {
    key: "media_leader",
    label: "Media & Tech Leader",
    shortLabel: "Media Leader",
    badgeLabel: "Media Leader",
    iconEmoji: "🎛️",
    badgeClass: "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-sm",
  },
  {
    key: "pastor",
    label: "Pastor / Elder",
    shortLabel: "Pastor",
    badgeLabel: "Pastor / Elder",
    iconEmoji: "✝️",
    badgeClass: "border-purple-400/40 bg-purple-500/15 text-purple-200 shadow-sm",
  },
];

export const SELF_SELECTABLE_MINISTRIES = [
  "Band Member",
  "Media & Tech",
  "Dance Ministry",
  "Singer / Member",
] as const;

export const SELF_SELECTABLE_BAND_ROLES = [
  "Acoustic Guitar",
  "Electric Guitar",
  "Bass",
  "Drums",
  "Main Keys",
  "Second Keys",
] as const;

export function getLeadershipRole(roleKeyOrLabel: string | null | undefined): LeadershipRoleDefinition | null {
  if (!roleKeyOrLabel) return null;
  const normalized = roleKeyOrLabel.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  
  return (
    LEADERSHIP_ROLES.find(
      (r) =>
        r.key.toLowerCase() === normalized ||
        r.label.toLowerCase() === roleKeyOrLabel.trim().toLowerCase() ||
        r.shortLabel.toLowerCase() === roleKeyOrLabel.trim().toLowerCase(),
    ) ?? null
  );
}

export function isLeadershipRole(roleKeyOrLabel: string | null | undefined): boolean {
  return getLeadershipRole(roleKeyOrLabel) !== null;
}

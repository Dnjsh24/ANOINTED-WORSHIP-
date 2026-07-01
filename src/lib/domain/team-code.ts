export function generateTeamCode(teamName: string, seed: string | number = Date.now()) {
  const initials =
    teamName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 3) || "TM";

  const code = Math.abs(hash(`${teamName}:${seed}`)) % 100000;
  return `${initials}-${code.toString().padStart(5, "0")}`;
}

function hash(value: string) {
  let result = 0;
  for (const char of value) {
    result = (result << 5) - result + char.charCodeAt(0);
    result |= 0;
  }
  return result;
}

export function generateTeamCode(teamName: string, seed: string | number = Date.now()) {
  const words = teamName.match(/[A-Za-z]+/g) ?? [];
  const initials = words
    .map((part) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 3);
  const fallbackLetters = words.join("").toUpperCase().slice(0, 3);
  const prefix = (initials.length >= 2 ? initials : fallbackLetters || "TM").padEnd(2, "M").slice(0, 3);

  const code = Math.abs(hash(`${teamName}:${seed}`)) % 100000;
  return `${prefix}-${code.toString().padStart(5, "0")}`;
}

function hash(value: string) {
  let result = 0;
  for (const char of value) {
    result = (result << 5) - result + char.charCodeAt(0);
    result |= 0;
  }
  return result;
}

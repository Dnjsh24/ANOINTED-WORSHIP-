export function toPostgresTime(value: string | null | undefined, fallback = "09:00:00") {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourHour) {
    const [, hourText, minuteText, secondText = "00"] = twentyFourHour;
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);

    if (hour <= 23 && minute <= 59 && second <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minuteText}:${secondText}`;
    }

    return fallback;
  }

  const twelveHour = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (twelveHour) {
    const [, hourText, minuteText = "00", meridiemText] = twelveHour;
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (hour >= 1 && hour <= 12 && minute <= 59) {
      const meridiem = meridiemText.toUpperCase();
      const normalizedHour = meridiem === "AM" ? hour % 12 : (hour % 12) + 12;
      return `${normalizedHour.toString().padStart(2, "0")}:${minuteText}:00`;
    }
  }

  return fallback;
}

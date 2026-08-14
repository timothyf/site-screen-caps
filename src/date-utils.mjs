export function getTodayDate(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function subtractDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return formatDate(date);
}

export function computeAge(
  birthday: string | null,
  deathday: string | null,
): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && end.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

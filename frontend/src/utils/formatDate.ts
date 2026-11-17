export function formatToIST(iso: string | null | undefined): string {
  if (!iso) return "Not synced yet";
  let dateStr = iso.trim();
  // Ensure string is treated as UTC if no offset exists
  if (!dateStr.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += "Z";
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Not synced yet";

  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return `${formatted} IST`;
}

export function formatShortIST(iso: string | null | undefined): string {
  if (!iso) return "Not synced yet";
  let dateStr = iso.trim();
  if (!dateStr.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += "Z";
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Not synced yet";

  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return `${formatted} IST`;
}

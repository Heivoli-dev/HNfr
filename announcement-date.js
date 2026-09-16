const publicationDateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

export function formatAnnouncementDate(announcement) {
  const date = announcement.createdAt?.toDate?.();
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    return publicationDateFormat.format(date);
  }
  const legacyDate = typeof announcement.date === "string" ? announcement.date.trim() : "";
  return /^aujourd['’]hui$/i.test(legacyDate) || !legacyDate
    ? "Date de publication indisponible"
    : legacyDate;
}

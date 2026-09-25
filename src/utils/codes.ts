// Short display codes. Orders (and stickers) have no human-readable number in the
// Order Service — only a UUID — so the app shows its last 6 characters, e.g. #D0987F.
export function shortCode(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

// Search text as typed, minus a leading "#" so "#D0987F" matches like "D0987F".
export function searchText(query: string): string {
  return query.trim().replace(/^#/, '').toLowerCase();
}

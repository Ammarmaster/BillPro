// Auto-generate a food image URL by dish name (no API key).
// Uses LoremFlickr keyword tagging as fallback source.
export function foodImageUrl(name: string): string {
  const q = encodeURIComponent(
    name.trim().replace(/[^a-zA-Z0-9, ]/g, "").replace(/\s+/g, ",") || "food"
  );
  return `https://loremflickr.com/320/320/${q},food?lock=${Math.abs(hashStr(name)) % 1000}`;
}

// Deterministic hash so same name => same image.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// Given a menu item, pick the best source: user upload → user URL → auto-fetch.
export function menuItemImageSource(item: { image_base64?: string; image_url?: string; name: string }) {
  if (item.image_base64) return { uri: `data:image/jpeg;base64,${item.image_base64}` };
  if (item.image_url) return { uri: item.image_url };
  return { uri: foodImageUrl(item.name) };
}

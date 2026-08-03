// Auto-generate a food image URL by dish name (no API key).
// Uses LoremFlickr keyword tagging as fallback source.
export function foodImageUrl(name: string): string {
  const title = (name || "food").toLowerCase().trim();
  
  if (title.includes("biryani") || title.includes("biryani")) {
    return "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=320&h=320&fit=crop";
  }
  if (title.includes("65")) {
    return "https://images.unsplash.com/photo-1610057099443-fde8c4d90ef8?w=320&h=320&fit=crop";
  }
  if (title.includes("thali")) {
    return "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=320&h=320&fit=crop";
  }
  if (title.includes("green")) {
    return "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=320&h=320&fit=crop";
  }
  if (title.includes("rice") || title.includes("kushk") || title.includes("kushka")) {
    return "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=320&h=320&fit=crop";
  }
  if (title.includes("chapati") || title.includes("roti") || title.includes("prota") || title.includes("parotta") || title.includes("naan") || title.includes("paratha")) {
    return "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=320&h=320&fit=crop";
  }
  if (title.includes("egg")) {
    return "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=320&h=320&fit=crop";
  }
  if (title.includes("chicken")) {
    return "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=320&h=320&fit=crop";
  }
  if (title.includes("mutton") || title.includes("meat")) {
    return "https://images.unsplash.com/photo-1544025162-d76694265947?w=320&h=320&fit=crop";
  }
  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=320&h=320&fit=crop";
}

// Given a menu item, pick the best source: user upload → user URL → auto-fetch.
export function menuItemImageSource(item: { image_base64?: string; image_url?: string; name: string }) {
  if (item.image_base64) return { uri: `data:image/jpeg;base64,${item.image_base64}` };
  if (item.image_url) return { uri: item.image_url };
  return { uri: foodImageUrl(item.name) };
}

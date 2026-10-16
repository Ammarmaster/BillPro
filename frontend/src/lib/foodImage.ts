// Auto-generate accurate food image URLs by dish name (100% free, zero API key).
// Uses high-definition curated food photography + Pollinations.ai free model generation for any dish.

// Curated dictionary of high-resolution food photos for popular dishes
const DISH_IMAGE_MAP: Array<{ keywords: string[]; url: string }> = [
  // Biryani & Rice
  {
    keywords: ["hyderabadi biryani", "chicken biryani", "dum biryani", "biryani", "biriyani", "briyani"],
    url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=400&fit=crop",
  },
  {
    keywords: ["mutton biryani", "gosht biryani"],
    url: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=400&h=400&fit=crop",
  },
  {
    keywords: ["veg biryani", "vegetable biryani", "pulao", "pulav", "veg pulao"],
    url: "https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=400&h=400&fit=crop",
  },
  {
    keywords: ["fried rice", "schezwan rice", "egg fried rice", "chicken fried rice"],
    url: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop",
  },
  {
    keywords: ["jeera rice", "kushk", "kushka", "steamed rice", "basmati rice", "curd rice", "rice"],
    url: "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400&h=400&fit=crop",
  },

  // Starters & Appetizers
  {
    keywords: ["chicken 65", "paneer 65", "gobi 65", "65"],
    url: "https://images.unsplash.com/photo-1610057099443-fde8c4d90ef8?w=400&h=400&fit=crop",
  },
  {
    keywords: ["tandoori chicken", "tandoori", "chicken tikka", "tangdi kebab"],
    url: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400&h=400&fit=crop",
  },
  {
    keywords: ["paneer tikka", "malai tikka", "paneer starter"],
    url: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&h=400&fit=crop",
  },
  {
    keywords: ["kebab", "kabab", "seekh kebab", "galouti"],
    url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=400&fit=crop",
  },
  {
    keywords: ["samosa", "samosas"],
    url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=400&fit=crop",
  },
  {
    keywords: ["spring roll", "spring rolls", "crispy roll"],
    url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop",
  },
  {
    keywords: ["momo", "momos", "dim sum", "dimsum", "dumpling"],
    url: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=400&fit=crop",
  },
  {
    keywords: ["manchurian", "gobi manchurian", "chilli paneer", "chilli chicken", "crispy corn"],
    url: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&h=400&fit=crop",
  },

  // Main Course - Non Veg
  {
    keywords: ["butter chicken", "murgh makhani", "chicken makhani"],
    url: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=400&h=400&fit=crop",
  },
  {
    keywords: ["chicken curry", "kadai chicken", "kadhai chicken", "chicken masala", "chicken"],
    url: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop",
  },
  {
    keywords: ["mutton rogan josh", "rogan josh", "mutton curry", "mutton korma", "mutton", "gosht", "lamb"],
    url: "https://images.unsplash.com/photo-1545247181-516773ca839b?w=400&h=400&fit=crop",
  },
  {
    keywords: ["fish curry", "fish fry", "prawns", "shrimp", "fish", "prawn"],
    url: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400&h=400&fit=crop",
  },
  {
    keywords: ["egg curry", "egg bhurji", "omelette", "omlet", "egg"],
    url: "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&h=400&fit=crop",
  },

  // Main Course - Veg
  {
    keywords: ["paneer butter masala", "shahi paneer", "kadai paneer", "palak paneer", "matar paneer", "paneer"],
    url: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=400&fit=crop",
  },
  {
    keywords: ["dal makhani", "dal makhni", "black dal"],
    url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=400&fit=crop",
  },
  {
    keywords: ["dal tadka", "dal fry", "yellow dal", "dal"],
    url: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=400&fit=crop",
  },
  {
    keywords: ["chole", "chana masala", "chole bhature", "bhature", "rajma"],
    url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&h=400&fit=crop",
  },
  {
    keywords: ["thali", "veg thali", "special thali", "deluxe thali"],
    url: "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=400&h=400&fit=crop",
  },

  // Breads
  {
    keywords: ["garlic naan", "butter naan", "naan", "tandoori roti", "roti", "chapati", "phulka", "paratha", "lachha paratha", "parotta", "kulcha"],
    url: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&h=400&fit=crop",
  },

  // South Indian
  {
    keywords: ["masala dosa", "mysore masala dosa", "dosa", "ghee roast"],
    url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&h=400&fit=crop",
  },
  {
    keywords: ["idli", "vada", "medu vada", "idli sambar", "uttapam"],
    url: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&h=400&fit=crop",
  },

  // Continental, Fast Food & Italian
  {
    keywords: ["margherita pizza", "pepperoni pizza", "farmhouse pizza", "cheese pizza", "pizza"],
    url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop",
  },
  {
    keywords: ["chicken burger", "veg burger", "cheeseburger", "burger"],
    url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop",
  },
  {
    keywords: ["french fries", "peri peri fries", "fries", "potato wedges"],
    url: "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=400&h=400&fit=crop",
  },
  {
    keywords: ["pasta", "white sauce pasta", "alfredo", "arrabiata", "macaroni", "lasagna"],
    url: "https://images.unsplash.com/photo-1621996346565-e3d5d628102a?w=400&h=400&fit=crop",
  },
  {
    keywords: ["hakka noodles", "noodles", "chowmein", "schezwan noodles"],
    url: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=400&fit=crop",
  },
  {
    keywords: ["sandwich", "club sandwich", "grilled sandwich", "toast"],
    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop",
  },
  {
    keywords: ["shawarma", "roll", "frankie", "wrap", "kathi roll"],
    url: "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?w=400&h=400&fit=crop",
  },

  // Desserts
  {
    keywords: ["gulab jamun", "jamun", "rasgulla", "rasmalai", "jalebi"],
    url: "https://images.unsplash.com/photo-1667489022797-ab608913feeb?w=400&h=400&fit=crop",
  },
  {
    keywords: ["ice cream", "kulfi", "sundae", "gelato"],
    url: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&h=400&fit=crop",
  },
  {
    keywords: ["brownie", "chocolate brownie", "pastry", "cake", "lava cake"],
    url: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=400&fit=crop",
  },

  // Beverages
  {
    keywords: ["chai", "masala chai", "tea", "green tea", "ginger tea"],
    url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&h=400&fit=crop",
  },
  {
    keywords: ["cold coffee", "filter coffee", "coffee", "cappuccino", "latte", "espresso"],
    url: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=400&h=400&fit=crop",
  },
  {
    keywords: ["lassi", "mango lassi", "buttermilk", "chaas"],
    url: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&h=400&fit=crop",
  },
  {
    keywords: ["fresh lime soda", "lime soda", "lemonade", "nimbu pani", "mojito", "mocktail"],
    url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&h=400&fit=crop",
  },
  {
    keywords: ["milkshake", "shake", "smoothie", "juice", "fruit juice"],
    url: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop",
  },
];

/**
 * Free model API generator: Generates dish photography using Pollinations AI (100% free, no API key).
 */
export function generateAiDishImageUrl(name: string): string {
  const clean = (name || "Delicious restaurant food")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const prompt = `Ultra-realistic macro closeup food photography of authentic ${clean}, mouth-watering restaurant dish presentation, glistening sauce, fresh garnishes, 85mm f1.8 lens, shallow depth of field, 8k realistic photo, no cartoon, no cgi`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=800&model=flux&enhance=true&nologo=true`;
}

/**
 * Auto-generate an accurate food image URL by dish name.
 * 1. Checks curated high-def food photography database for popular dishes.
 * 2. If not matched, dynamically queries Pollinations free AI image model for the exact dish.
 */
export function foodImageUrl(name: string): string {
  const title = (name || "").toLowerCase().trim();
  if (!title) {
    return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop";
  }

  // Find best matching curated dish
  for (const entry of DISH_IMAGE_MAP) {
    for (const kw of entry.keywords) {
      if (title.includes(kw)) {
        return entry.url;
      }
    }
  }

  // Accurate Free Model Fallback
  return generateAiDishImageUrl(title);
}

/**
 * Given a menu item, pick the best source:
 * 1. User base64 upload
 * 2. User remote URL
 * 3. Accurate AI auto-fetch by dish name
 */
export function menuItemImageSource(item: { image_base64?: string; image_url?: string; name: string }) {
  if (item.image_base64 && item.image_base64.trim()) {
    const b64 = item.image_base64.trim();
    return { uri: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}` };
  }
  if (item.image_url && item.image_url.trim().startsWith("http")) {
    return { uri: item.image_url.trim() };
  }
  return { uri: foodImageUrl(item.name) };
}

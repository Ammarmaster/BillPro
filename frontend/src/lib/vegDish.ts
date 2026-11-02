const NON_VEG_WORDS = /\b(non[\s-]?veg|chicken|murgh?|mutton|lamb|goat|gosht|keema|kheema|beef|pork|bacon|ham|sausage|salami|pepperoni|meat|fish|machh?li|machhi|prawns?|shrimps?|crabs?|lobster|squid|seafood|tuna|salmon|eggs?|anda|omelett?e?)\b/i;
const VEG_ONLY_WORDS = /\b(soya|soy|mock|vegan)\b/i;

// Dishes with no saved choice (added by hand, or older ones) are judged by name, so a new name gets a new answer
export function isVegDish(item: { name?: string; is_veg?: boolean | null }): boolean {
  if (typeof item.is_veg === "boolean") return item.is_veg;
  const name = (item.name || "").replace(/\b(eggless|egg[\s-]free|without egg|no egg)\b/gi, " ");
  return VEG_ONLY_WORDS.test(name) || !NON_VEG_WORDS.test(name);
}

export const vegMarkColor = (item: { name?: string; is_veg?: boolean | null }) =>
  isVegDish(item) ? "#16A34A" : "#DC2626";

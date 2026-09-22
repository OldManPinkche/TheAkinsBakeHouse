(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.BakeHouseRules = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const menuItems = [
    { name: "Weekend Favorites Box", price: 55, label: "starting at", starting: true },
    { name: "Cozy Morning Box", price: 40, label: "starting at", starting: true },
    { name: "Cookie Drop", price: 18, label: "per dozen", starting: false },
    { name: "Oatmeal Raisin Cookies", price: 18, label: "per dozen", starting: false },
    { name: "No Bake Cookies", price: 18, label: "per dozen", starting: false },
    { name: "Peanut Butter Cookies", price: 18, label: "per dozen", starting: false },
    { name: "Chocolate Chip Cookies", price: 20, label: "per dozen", starting: false },
    { name: "Cookie Cakes", price: 30, label: "each", starting: true },
    { name: "Cake Pops", price: 30, label: "per dozen", starting: false },
    { name: "Butterfinger Cake", price: 28, label: "each", starting: true },
    { name: "Cupcakes", price: 28, label: "per dozen", starting: false },
    { name: "Cheesecake", price: 35, label: "each", starting: true },
    { name: "Cinnamon Rolls", price: 30, label: "per dozen", starting: false },
    { name: "Banana Bread", price: 12, label: "per loaf", starting: false },
    { name: "Pumpkin Bread", price: 12, label: "per loaf", starting: false },
    { name: "Coconut Cream Pie", price: 25, label: "per pie", starting: false },
    { name: "Banana Pudding", price: 20, label: "each", starting: true }
  ];
  const limits = { quantity: 20, name: 80, contact: 120, occasion: 80, notes: 1000, pickupTime: 40, itemRequest: 200 };
  const priceBook = Object.fromEntries(menuItems.map(item => [item.name, item]));
  const hasItem = name => typeof name === "string" && Object.prototype.hasOwnProperty.call(priceBook, name);
  const text = value => typeof value === "string" ? value.trim() : "";
  // Approved add-on prices are per menu unit (one dozen, loaf, or pie).
  // Unpriced choices and additional written requests still require a quote.
  const optionLabels = {
    original: "Original recipe", raisins: "Add raisins", pecans: "Add pecans",
    "raisins-pecans": "Add raisins + pecans", walnuts: "Add walnuts",
    "chocolate-chips": "Add chocolate chips", "chocolate-drizzle": "Chocolate drizzle",
    "apple-cinnamon": "Apple-cinnamon filling", "orange-zest": "Orange zest",
    "maple-glaze": "Maple glaze", "maple-pecans": "Maple glaze + pecans",
    "caramel-drizzle": "Caramel drizzle", "cream-cheese-icing": "Cream cheese icing",
    "dried-cranberries": "Dried cranberries", "cream-cheese-swirl": "Cream cheese swirl",
    "cinnamon-streusel": "Cinnamon streusel", "toffee-bits": "Toffee bits",
    "shredded-coconut": "Shredded coconut", "cinnamon-swirl": "Cinnamon swirl",
    "white-chocolate-chips": "White chocolate chips", "crushed-pretzels": "Crushed pretzels",
    "lemon-zest": "Lemon zest", "raspberry-filling": "Raspberry filling",
    "crushed-cookies": "Crushed cookies", "toasted-coconut": "Toasted coconut",
    "lemon-curd": "Lemon curd", "cherry-topping": "Cherry topping",
    strawberries: "Strawberries", "crushed-chocolate-cookies": "Chocolate sandwich cookies",
    vanilla: "Vanilla flavor", chocolate: "Chocolate flavor", "mixed-flavors": "Mixed flavors",
    "fruit-topping": "Fruit topping", "caramel-pecans": "Caramel + pecans",
    "extra-coconut": "Extra coconut", message: "Personalized message",
    decoration: "Custom decoration", "bundle-mix": "Change the box selection",
    "rolls-maple-pecans": "Maple-pecan rolls", "bread-chocolate-chips": "Chocolate chip bread",
    "bread-cream-cheese": "Cream cheese swirl bread",
    custom: "Something else"
  };
  const itemOptions = {
    "Cinnamon Rolls": ["raisins", "pecans", "raisins-pecans", "chocolate-chips", "apple-cinnamon", "orange-zest", "maple-glaze", "maple-pecans", "caramel-drizzle", "cream-cheese-icing"],
    "Pumpkin Bread": ["pecans", "walnuts", "chocolate-chips", "raisins", "raisins-pecans", "dried-cranberries", "cream-cheese-swirl", "cinnamon-streusel", "maple-glaze"],
    "Banana Bread": ["walnuts", "pecans", "chocolate-chips", "raisins", "raisins-pecans", "toffee-bits", "shredded-coconut", "cinnamon-swirl", "cinnamon-streusel"],
    "Oatmeal Raisin Cookies": ["pecans", "walnuts", "chocolate-chips", "white-chocolate-chips", "toffee-bits", "dried-cranberries"],
    "No Bake Cookies": ["pecans", "chocolate-drizzle", "white-chocolate-chips", "toffee-bits", "dried-cranberries", "crushed-pretzels"],
    "Cookie Drop": ["pecans", "chocolate-drizzle", "white-chocolate-chips", "toffee-bits", "dried-cranberries", "crushed-pretzels"],
    "Peanut Butter Cookies": ["chocolate-chips", "chocolate-drizzle", "white-chocolate-chips", "toffee-bits", "crushed-pretzels"],
    "Chocolate Chip Cookies": ["pecans", "walnuts", "white-chocolate-chips", "toffee-bits", "dried-cranberries", "crushed-pretzels"],
    "Cookie Cakes": ["message", "decoration", "pecans", "white-chocolate-chips", "toffee-bits", "caramel-drizzle"],
    "Cake Pops": ["vanilla", "chocolate", "mixed-flavors", "decoration", "crushed-cookies", "toasted-coconut", "chocolate-drizzle"],
    "Cupcakes": ["vanilla", "chocolate", "mixed-flavors", "decoration", "lemon-zest", "raspberry-filling", "crushed-cookies", "toasted-coconut"],
    "Butterfinger Cake": ["message", "decoration", "chocolate-drizzle", "caramel-drizzle", "toffee-bits", "crushed-cookies"],
    "Cheesecake": ["fruit-topping", "chocolate-drizzle", "caramel-pecans", "lemon-curd", "cherry-topping", "crushed-cookies"],
    "Coconut Cream Pie": ["extra-coconut", "chocolate-drizzle", "toasted-coconut", "lemon-zest", "caramel-drizzle"],
    "Banana Pudding": ["chocolate-drizzle", "strawberries", "caramel-drizzle", "crushed-chocolate-cookies"],
    "Weekend Favorites Box": ["bundle-mix", "rolls-maple-pecans", "bread-chocolate-chips", "bread-cream-cheese"],
    "Cozy Morning Box": ["bundle-mix", "rolls-maple-pecans", "bread-chocolate-chips", "bread-cream-cheese"]
  };
  const breadAddons = {
    raisins: 2, pecans: 3, walnuts: 3, "chocolate-chips": 2, "raisins-pecans": 4,
    "dried-cranberries": 2, "cream-cheese-swirl": 4, "cinnamon-streusel": 2,
    "maple-glaze": 2, "toffee-bits": 2, "shredded-coconut": 2, "cinnamon-swirl": 2
  };
  const cookieAddons = {
    pecans: 4, walnuts: 4, "chocolate-chips": 3, "white-chocolate-chips": 3,
    "chocolate-drizzle": 3, "toffee-bits": 3, "dried-cranberries": 3, "crushed-pretzels": 3
  };
  // Edit approved surcharges here. Omitted options stay quote-only, never free.
  const addonPrices = {
    "Cinnamon Rolls": {
      raisins: 4, pecans: 6, "raisins-pecans": 8, "chocolate-chips": 4,
      "apple-cinnamon": 6, "orange-zest": 4, "maple-glaze": 4,
      "maple-pecans": 8, "caramel-drizzle": 4, "cream-cheese-icing": 6
    },
    "Banana Bread": breadAddons, "Pumpkin Bread": breadAddons,
    "Oatmeal Raisin Cookies": cookieAddons, "No Bake Cookies": cookieAddons,
    "Cookie Drop": cookieAddons, "Peanut Butter Cookies": cookieAddons,
    "Chocolate Chip Cookies": cookieAddons,
    "Cupcakes": { "lemon-zest": 3, "raspberry-filling": 6, "crushed-cookies": 4, "toasted-coconut": 4 },
    "Cake Pops": { "crushed-cookies": 4, "toasted-coconut": 4, "chocolate-drizzle": 3 },
    "Coconut Cream Pie": { "extra-coconut": 3, "chocolate-drizzle": 3, "toasted-coconut": 3, "lemon-zest": 3, "caramel-drizzle": 3 }
  };
  function optionsFor(name) {
    return hasItem(name) ? ["original", ...(itemOptions[name] || []), "custom"].map(id => ({
      id, label: optionLabels[id], price: id === "original" ? 0 :
        Object.prototype.hasOwnProperty.call(addonPrices[name] || {}, id) ? addonPrices[name][id] : null
    })) : [];
  }
  function normalizeCartItem(item) {
    if (hasItem(item)) return item; // Retain existing carts and saved favorites.
    if (!item || typeof item !== "object" || Array.isArray(item) || !hasItem(item.name)) return null;
    const option = item.option === undefined ? "original" : item.option;
    if (!optionsFor(item.name).some(candidate => candidate.id === option)) return null;
    if (item.request !== undefined && typeof item.request !== "string") return null;
    const request = text(item.request);
    if (request.length > limits.itemRequest || (option === "custom" && !request)) return null;
    if (option === "original") return request ? null : item.name;
    return { name: item.name, option, request };
  }
  const cartName = item => typeof item === "string" ? item : item.name;
  const cartKey = item => JSON.stringify(typeof item === "string" ? [item, "original", ""] : [item.name, item.option, item.request]);
  const cartDetails = item => typeof item === "string" ? "" : `${optionLabels[item.option]}${item.request ? ` — ${item.request}` : ""}`;
  const cartLabel = item => `${cartName(item)}${typeof item === "string" ? "" : ` — ${cartDetails(item)}`}`;
  function priceSelection(item) {
    const entry = normalizeCartItem(item);
    if (!entry) return null;
    const name = cartName(entry);
    const option = typeof entry === "string" ? "original" : entry.option;
    const extra = optionsFor(name).find(candidate => candidate.id === option).price;
    return {
      extra, unitPrice: priceBook[name].price + (extra ?? 0),
      needsQuote: priceBook[name].starting || extra === null || Boolean(typeof entry !== "string" && entry.request)
    };
  }
  function validContact(value) {
    value = text(value);
    if (value.length > limits.contact) return false;
    if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return /^[+\d\s().-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, ""));
  }
  function todayInOklahoma(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function validDate(value, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= todayInOklahoma(now);
  }
  function sanitizeCart(value) {
    if (!Array.isArray(value)) return [];
    const counts = new Map();
    return value.slice(0, menuItems.length * limits.quantity * 2).map(normalizeCartItem).filter(item => {
      if (!item) return false;
      const name = cartName(item);
      const count = (counts.get(name) || 0) + 1;
      counts.set(name, count);
      return count <= limits.quantity;
    });
  }
  return { menuItems, priceBook, limits, hasItem, text, validContact, todayInOklahoma, validDate, sanitizeCart, optionsFor, normalizeCartItem, cartName, cartKey, cartDetails, cartLabel, priceSelection };
});

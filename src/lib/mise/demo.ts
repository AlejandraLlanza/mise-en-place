import { generateDays, emptyDays } from "./generate";
import { uid } from "./parse";
import { extractFromSource, mergeCandidates, type Source } from "./sources";
import type { Candidate, Trip } from "./types";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

type Seed = Omit<Candidate, "id" | "include" | "booking" | "confirmation">;

const cdmxSeeds: Seed[] = [
  {
    name: "Contramar",
    address: "Calle Durango 200, Roma Norte",
    bookedVia: "Resy",
    anchorPartySize: 2,
    neighborhood: "Roma Norte",
    price: 3,
    tags: ["long boozy lunch", "local institution", "loud and social"],
    meals: ["lunch"],
    cuisine: "seafood",
    source: "my own list",
    via: "you",
    notes: "Tuna tostadas, pescado a la talla. Long lunch, don't plan anything after.",
    isAnchor: true,
    anchorDay: 1,
    anchorMeal: "lunch",
    anchorTime: "14:30",
  },
  {
    name: "Pujol",
    address: "Tennyson 133, Polanco",
    bookedVia: "direct",
    anchorPartySize: 2,
    neighborhood: "Polanco",
    price: 4,
    tags: ["tasting menu", "chef's counter", "quiet and refined"],
    meals: ["dinner"],
    cuisine: "contemporary mexican",
    source: "my own list",
    via: "you",
    notes: "Booked the taco omakase counter.",
    isAnchor: true,
    anchorDay: 3,
    anchorMeal: "dinner",
    anchorTime: "20:30",
  },
  {
    name: "Rosetta",
    address: "Colima 166, Roma Norte",
    bookedVia: "WhatsApp",
    anchorPartySize: 2,
    neighborhood: "Roma Norte",
    price: 3,
    tags: ["date night", "quiet and refined"],
    meals: ["dinner"],
    cuisine: "italian",
    source: "my own list",
    via: "you",
    notes: "In the old mansion. Ask for the upstairs room.",
    isAnchor: true,
    anchorDay: 0,
    anchorMeal: "dinner",
    anchorTime: "20:00",
  },
  {
    name: "Panadería Rosetta",
    neighborhood: "Roma Norte",
    price: 1,
    tags: ["low-key breakfast", "outdoor seating"],
    meals: ["breakfast"],
    cuisine: "bakery",
    source: "friend rec",
    via: "Isabel",
    notes: "Guava roll and a cortado standing at the window.",
  },
  {
    name: "Máximo Bistrot",
    neighborhood: "Roma Norte",
    price: 4,
    tags: ["quiet and refined", "date night"],
    meals: ["dinner", "lunch"],
    cuisine: "french",
    source: "blog / press",
    via: "Eater",
    notes: "Market-driven, changes daily.",
  },
  {
    name: "Loup Bar",
    neighborhood: "Roma Norte",
    price: 3,
    tags: ["natural wine bar", "loud and social", "date night"],
    meals: ["dinner", "drinks"],
    cuisine: "wine",
    source: "friend rec",
    via: "Isabel",
    notes: "Natural wine, tiny plates, everyone spills onto the sidewalk.",
  },
  {
    name: "El Califa de León",
    neighborhood: "San Rafael",
    price: 1,
    tags: ["hole in the wall", "local institution"],
    meals: ["lunch", "dinner"],
    cuisine: "tacos",
    source: "blog / press",
    via: "Michelin guide",
    notes: "Four tacos on the menu, room for six people standing.",
  },
  {
    name: "Expendio de Maíz",
    neighborhood: "Roma Norte",
    price: 2,
    tags: ["chef's counter", "vegetarian-friendly"],
    meals: ["lunch"],
    cuisine: "corn",
    source: "friend rec",
    via: "Mateo",
    notes: "No menu, they just keep bringing things until you say stop.",
  },
  {
    name: "Mercado de Medellín",
    neighborhood: "Roma Sur",
    price: 1,
    tags: ["market stall", "loud and social"],
    meals: ["lunch", "breakfast"],
    cuisine: "market",
    source: "saved from social",
    via: "Instagram",
    notes: "Colombian and Venezuelan stalls at the back.",
  },
  {
    name: "Handshake Speakeasy",
    neighborhood: "Juárez",
    price: 4,
    tags: ["great cocktails", "quiet and refined"],
    meals: ["drinks"],
    cuisine: "bar",
    source: "blog / press",
    via: "World's 50 Best Bars",
    notes: "Reserve, or you will not get in.",
  },
  {
    name: "Bar Oriente",
    neighborhood: "Condesa",
    price: 2,
    tags: ["great cocktails", "loud and social"],
    meals: ["drinks"],
    cuisine: "bar",
    source: "friend rec",
    via: "Mateo",
    notes: "Mezcal and a jukebox that nobody controls.",
  },
  {
    name: "Lardo",
    neighborhood: "Condesa",
    price: 2,
    tags: ["outdoor seating", "low-key breakfast"],
    meals: ["breakfast", "lunch"],
    cuisine: "mediterranean",
    source: "blog / press",
    via: "Condé Nast",
    notes: "Wood oven flatbreads, good coffee, tables on the sidewalk.",
  },
  {
    name: "Fonda Margarita",
    neighborhood: "Narvarte",
    price: 1,
    tags: ["low-key breakfast", "local institution"],
    meals: ["breakfast"],
    cuisine: "fonda",
    source: "friend rec",
    via: "Isabel",
    notes: "Opens at 5:30am, closes when the pots are empty. Cash.",
  },
  {
    name: "Nicos",
    neighborhood: "Santa María la Ribera",
    price: 3,
    tags: ["local institution", "long boozy lunch"],
    meals: ["lunch"],
    cuisine: "classic mexican",
    source: "blog / press",
    via: "NYT",
    notes: "Sopa seca, tableside guacamole, waiters who have been there 30 years.",
  },
  {
    name: "Masala y Maíz",
    neighborhood: "San Rafael",
    price: 3,
    tags: ["new opening", "vegetarian-friendly"],
    meals: ["lunch", "dinner"],
    cuisine: "indian-mexican",
    source: "friend rec",
    via: "Mateo",
    notes: "Indian, East African and Mexican cooking in one kitchen.",
  },
  {
    name: "Em",
    neighborhood: "Juárez",
    price: 4,
    tags: ["chef's counter", "new opening", "quiet and refined"],
    meals: ["dinner"],
    cuisine: "contemporary mexican",
    source: "saved from social",
    via: "Instagram",
    notes: "Open-fire counter, twelve seats.",
  },
  {
    name: "Taquería Orinoco",
    neighborhood: "Roma Norte",
    price: 1,
    tags: ["hole in the wall", "loud and social"],
    meals: ["dinner", "drinks"],
    cuisine: "tacos",
    source: "saved from social",
    via: "TikTok",
    notes: "Late-night trompo. Order chicharrón on the side.",
  },
  {
    name: "Cicatriz",
    neighborhood: "Juárez",
    price: 2,
    tags: ["low-key breakfast", "outdoor seating", "natural wine bar"],
    meals: ["breakfast", "lunch", "drinks"],
    cuisine: "cafe",
    source: "friend rec",
    via: "Isabel",
    notes: "Kale salad everyone pretends not to order in Mexico City.",
  },
  {
    name: "Los Danzantes",
    neighborhood: "Coyoacán",
    price: 3,
    tags: ["outdoor seating", "date night"],
    meals: ["lunch", "dinner"],
    cuisine: "oaxacan",
    source: "blog / press",
    via: "Lonely Planet",
    notes: "On the plaza, mezcal list as long as the menu.",
  },
  {
    name: "Azul Histórico",
    neighborhood: "Centro Histórico",
    price: 3,
    tags: ["outdoor seating", "local institution"],
    meals: ["lunch"],
    cuisine: "classic mexican",
    source: "blog / press",
    via: "Eater",
    notes: "Courtyard under the trees inside a colonial building.",
  },
  {
    name: "Mercado Roma",
    neighborhood: "Roma Norte",
    price: 2,
    tags: ["market stall", "loud and social", "great cocktails"],
    meals: ["lunch", "drinks"],
    cuisine: "market",
    source: "saved from social",
    via: "Instagram",
    notes: "Uneven, but the rooftop pulque bar is worth it.",
  },
];

const tokyoSeeds: Seed[] = [
  {
    name: "Sushi Sho",
    address: "4-4-1 Yotsuya, Shinjuku City",
    bookedVia: "hotel concierge",
    anchorPartySize: 2,
    neighborhood: "Yotsuya",
    price: 4,
    tags: ["chef's counter", "tasting menu", "quiet and refined"],
    meals: ["dinner"],
    cuisine: "japanese",
    source: "my own list",
    via: "you",
    notes: "Counter only. Be on time — the omakase starts when it starts.",
    isAnchor: true,
    anchorDay: 1,
    anchorMeal: "dinner",
    anchorTime: "18:00",
  },
  {
    name: "Den",
    address: "2-3-18 Jingumae, Shibuya City",
    bookedVia: "direct",
    anchorPartySize: 2,
    neighborhood: "Jingumae",
    price: 4,
    tags: ["tasting menu", "chef's counter"],
    meals: ["dinner"],
    cuisine: "contemporary japanese",
    source: "my own list",
    via: "you",
    notes: "Playful kaiseki. The fried chicken arrives in a paper bag.",
    isAnchor: true,
    anchorDay: 3,
    anchorMeal: "dinner",
    anchorTime: "18:30",
  },
  {
    name: "Ahiru Store",
    neighborhood: "Tomigaya",
    price: 3,
    tags: ["natural wine bar", "loud and social"],
    meals: ["dinner", "drinks"],
    cuisine: "wine",
    source: "friend rec",
    via: "Naoko",
    notes: "Natural wine and sausages, twelve seats, queue from opening.",
  },
  {
    name: "Fuglen Tokyo",
    neighborhood: "Tomigaya",
    price: 2,
    tags: ["low-key breakfast", "outdoor seating"],
    meals: ["breakfast", "drinks"],
    cuisine: "cafe",
    source: "friend rec",
    via: "Naoko",
    notes: "Norwegian coffee in the morning, cocktails at night.",
  },
  {
    name: "Afuri Harajuku",
    neighborhood: "Harajuku",
    price: 1,
    tags: ["hole in the wall", "local institution"],
    meals: ["lunch", "dinner"],
    cuisine: "ramen",
    source: "blog / press",
    via: "Time Out Tokyo",
    notes: "Yuzu shio ramen, ticket machine at the door.",
  },
  {
    name: "Tonkatsu Maisen Aoyama",
    neighborhood: "Aoyama",
    price: 2,
    tags: ["local institution", "low-key breakfast"],
    meals: ["lunch"],
    cuisine: "tonkatsu",
    source: "friend rec",
    via: "Kenji",
    notes: "Old bathhouse turned into a tonkatsu hall.",
  },
  {
    name: "Bear Pond Espresso",
    neighborhood: "Shimokitazawa",
    price: 1,
    tags: ["low-key breakfast", "hole in the wall"],
    meals: ["breakfast"],
    cuisine: "coffee",
    source: "saved from social",
    via: "Instagram",
    notes: "No photos behind the counter. Angel Stain before noon.",
  },
  {
    name: "Shirube",
    neighborhood: "Shimokitazawa",
    price: 2,
    tags: ["loud and social", "great cocktails"],
    meals: ["dinner", "drinks"],
    cuisine: "izakaya",
    source: "friend rec",
    via: "Kenji",
    notes: "Blowtorched aburi salad, book ahead.",
  },
  {
    name: "Tsukiji Outer Market",
    neighborhood: "Tsukiji",
    price: 1,
    tags: ["market stall", "loud and social"],
    meals: ["breakfast", "lunch"],
    cuisine: "market",
    source: "blog / press",
    via: "NYT",
    notes: "Go early, eat tamagoyaki standing up.",
  },
  {
    name: "Bar Benfiddich",
    neighborhood: "Nishishinjuku",
    price: 4,
    tags: ["great cocktails", "quiet and refined"],
    meals: ["drinks"],
    cuisine: "bar",
    source: "blog / press",
    via: "World's 50 Best Bars",
    notes: "Herbs ground at the bar with a mortar. No menu.",
  },
  {
    name: "Sasaya Cafe",
    neighborhood: "Sumida",
    price: 2,
    tags: ["vegetarian-friendly", "outdoor seating"],
    meals: ["breakfast", "lunch"],
    cuisine: "vegan",
    source: "saved from social",
    via: "Instagram",
    notes: "Vegan lunch plates by the park.",
  },
  {
    name: "Kagari Ginza",
    neighborhood: "Ginza",
    price: 1,
    tags: ["hole in the wall", "local institution"],
    meals: ["lunch"],
    cuisine: "ramen",
    source: "blog / press",
    via: "Michelin guide",
    notes: "Chicken paitan so thick the noodles stand up in it.",
  },
];

const CDMX = {
  city: "Mexico City",
  seeds: cdmxSeeds,
  prefs: {
    chips: [
      "natural wine bar",
      "chef's counter",
      "hole in the wall",
      "local institution",
      "long boozy lunch",
      "outdoor seating",
    ],
    priceMin: 1,
    priceMax: 3,
    party: "partner" as const,
    travel: {
      description:
        "Modernist architecture, one good market, long neighbourhood walks, nothing rushed.",
      interests: [
        "architecture & design",
        "markets",
        "neighbourhood walking",
        "art & museums",
      ],
      pace: "balanced" as const,
    },
  },
  sources: [
    {
      name: "Isabel",
      trust: "high" as const,
      kind: "friend rec" as const,
      text:
        "Contramar — the tuna tostada, don't skip it, and sit at the bar.\n" +
        "Loup Bar in Roma Norte for natural wine, tiny and loud.\n" +
        "Fonda Margarita for breakfast, get there before 9, cash only.\n" +
        "Go to Casa Luis Barragán, it's the best thing in the city, book ahead.\n" +
        "Walk Avenida Ámsterdam at sunset.",
    },
    {
      name: "Miguel",
      trust: "normal" as const,
      kind: "friend rec" as const,
      text:
        "contramar roma norte, obviously\n" +
        "El Califa de León for tacos, hole in the wall, five minutes and out.\n" +
        "Mercado de Medellín in the morning, then Museo Tamayo.",
    },
    {
      name: "Eater CDMX",
      trust: "low" as const,
      kind: "blog / press" as const,
      text:
        "Contramar remains the long lunch of record in Roma Norte.\n" +
        "Máximo Bistrot — market-driven, book weeks ahead.",
    },
  ],
};

const TOKYO = {
  city: "Tokyo",
  seeds: tokyoSeeds,
  prefs: {
    chips: [
      "chef's counter",
      "hole in the wall",
      "natural wine bar",
      "local institution",
      "great cocktails",
      "quiet and refined",
    ],
    priceMin: 1,
    priceMax: 4,
    party: "partner" as const,
    travel: {
      description:
        "Temples early, second-hand bookshops, one long walk along the river, tiny bars at night.",
      interests: [
        "history",
        "bookshops",
        "neighbourhood walking",
        "art & museums",
      ],
      pace: "balanced" as const,
    },
  },
  sources: [
    {
      name: "Naoko",
      trust: "high" as const,
      kind: "friend rec" as const,
      text:
        "Ahiru Store in Tomigaya — go at opening or you won't get in.\n" +
        "Fuglen for coffee in the morning and cocktails at night.\n" +
        "Go to Sensoji early, before the crowds.\n" +
        "Walk the Meguro river in the evening.",
    },
    {
      name: "Kenji",
      trust: "normal" as const,
      kind: "friend rec" as const,
      text:
        "ahiru store, obviously\n" +
        "Shirube in Shimokitazawa for izakaya, loud and fun.\n" +
        "Nezu Museum in the morning, then Omotesando for the architecture.",
    },
    {
      name: "Time Out Tokyo",
      trust: "low" as const,
      kind: "blog / press" as const,
      text:
        "Ahiru Store is still the natural wine benchmark in Shibuya.\n" +
        "Afuri Harajuku — yuzu shio ramen, open late.",
    },
  ],
};

export type DemoKind = "mexico-city" | "tokyo";

const DEMOS: Record<DemoKind, typeof CDMX> = {
  "mexico-city": CDMX,
  tokyo: TOKYO,
};

export function buildDemoTrip(kind: DemoKind = "mexico-city"): Trip {
  const demo = DEMOS[kind];

  const candidates: Candidate[] = demo.seeds.map((s) => ({
    ...s,
    id: uid(),
    include: true,
    booking: s.isAnchor ? "Booked" : "Not booked",
    confirmation: s.isAnchor ? "CONF-" + Math.floor(1000 + Math.random() * 8999) : "",
  }));

  const basics = {
    city: demo.city,
    startDate: iso(3),
    endDate: iso(7),
    partySize: 2,
  };

  const prefs = demo.prefs;

  const sources: Source[] = demo.sources.map((s) => ({
    id: uid(),
    name: s.name,
    trust: s.trust,
    kind: s.kind,
    addedAt: new Date().toISOString(),
    text: s.text,
  }));

  const withSources = mergeCandidates([
    ...candidates,
    ...sources.flatMap((src) => extractFromSource(src, basics.city)),
  ]);

  const days = generateDays(
    emptyDays(basics.startDate, basics.endDate, basics.city),
    withSources,
    prefs,
  );

  return { basics, prefs, candidates: withSources, days, sources };
}

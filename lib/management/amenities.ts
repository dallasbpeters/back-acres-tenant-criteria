export const amenityOptions = [
  { id: "air_conditioning", label: "Air conditioning", icon: "snowflake" },
  { id: "heating", label: "Heating", icon: "thermometer" },
  { id: "dishwasher", label: "Dishwasher", icon: "dishes" },
  { id: "oven", label: "Oven & range", icon: "oven" },
  { id: "washer_dryer", label: "Washer & dryer", icon: "laundry" },
  { id: "laundry_hookups", label: "Laundry hookups", icon: "plugs" },
  { id: "parking", label: "Off-street parking", icon: "car" },
  { id: "garage", label: "Garage", icon: "garage" },
  { id: "yard", label: "Yard", icon: "tree" },
  { id: "patio", label: "Patio", icon: "sun" },
  { id: "fireplace", label: "Fireplace", icon: "flame" },
  { id: "pool", label: "Pool", icon: "pool" },
  { id: "ceiling_fans", label: "Ceiling fans", icon: "fan" },
  { id: "walk_in_closets", label: "Walk-in closets", icon: "hanger" },
  { id: "pets_allowed", label: "Pets allowed", icon: "paw" },
  { id: "step_free_access", label: "Step-free access", icon: "wheelchair" },
] as const;
export type AmenityId = (typeof amenityOptions)[number]["id"];
export const amenityIds = amenityOptions.map((option) => option.id) as [
  AmenityId,
  ...AmenityId[],
];

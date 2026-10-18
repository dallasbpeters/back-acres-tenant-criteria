export const amenityOptions = [
  { icon: "snowflake", id: "air_conditioning", label: "Air conditioning" },
  { icon: "thermometer", id: "heating", label: "Heating" },
  { icon: "dishes", id: "dishwasher", label: "Dishwasher" },
  { icon: "oven", id: "oven", label: "Oven & range" },
  { icon: "laundry", id: "washer_dryer", label: "Washer & dryer" },
  { icon: "plugs", id: "laundry_hookups", label: "Laundry hookups" },
  { icon: "car", id: "parking", label: "Off-street parking" },
  { icon: "garage", id: "garage", label: "Garage" },
  { icon: "tree", id: "yard", label: "Yard" },
  { icon: "sun", id: "patio", label: "Patio" },
  { icon: "flame", id: "fireplace", label: "Fireplace" },
  { icon: "pool", id: "pool", label: "Pool" },
  { icon: "fan", id: "ceiling_fans", label: "Ceiling fans" },
  { icon: "hanger", id: "walk_in_closets", label: "Walk-in closets" },
  { icon: "paw", id: "pets_allowed", label: "Pets allowed" },
  { icon: "wheelchair", id: "step_free_access", label: "Step-free access" },
] as const;
export type AmenityId = (typeof amenityOptions)[number]["id"];
export const amenityIds = amenityOptions.map((option) => option.id) as [
  AmenityId,
  ...AmenityId[],
];

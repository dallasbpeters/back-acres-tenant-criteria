import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  XIcon,
  ImagesIcon,
  BedIcon,
  BathtubIcon,
  CalendarBlankIcon,
  MoneyIcon,
  MapPinIcon,
  SnowflakeIcon,
  ThermometerIcon,
  ForkKnifeIcon,
  OvenIcon,
  WashingMachineIcon,
  PlugsIcon,
  CarIcon,
  GarageIcon,
  TreeIcon,
  SunIcon,
  FlameIcon,
  SwimmingPoolIcon,
  FanIcon,
  CoatHangerIcon,
  PawPrintIcon,
  WheelchairIcon,
  CheckIcon,
  HouseLineIcon,
  SignOutIcon,
  MoonStarsIcon,
} from "@phosphor-icons/react/ssr";

const icons = {
  back: ArrowLeftIcon,
  next: ArrowRightIcon,
  external: ArrowUpRightIcon,
  close: XIcon,
  photos: ImagesIcon,
  bed: BedIcon,
  bath: BathtubIcon,
  calendar: CalendarBlankIcon,
  money: MoneyIcon,
  location: MapPinIcon,
  snowflake: SnowflakeIcon,
  thermometer: ThermometerIcon,
  dishes: ForkKnifeIcon,
  oven: OvenIcon,
  laundry: WashingMachineIcon,
  plugs: PlugsIcon,
  car: CarIcon,
  garage: GarageIcon,
  tree: TreeIcon,
  sun: SunIcon,
  flame: FlameIcon,
  pool: SwimmingPoolIcon,
  fan: FanIcon,
  hanger: CoatHangerIcon,
  paw: PawPrintIcon,
  wheelchair: WheelchairIcon,
  check: CheckIcon,
  home: HouseLineIcon,
  signout: SignOutIcon,
  theme: MoonStarsIcon,
} as const;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: keyof typeof icons;
  size?: number;
  className?: string;
}) {
  const Glyph = icons[name];
  return (
    <Glyph
      className={`app-icon ${className}`}
      size={size}
      weight="regular"
      aria-hidden="true"
      focusable="false"
    />
  );
}

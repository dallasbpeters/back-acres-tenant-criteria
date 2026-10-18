import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BathtubIcon,
  BedIcon,
  CalendarBlankIcon,
  CarIcon,
  CheckIcon,
  CoatHangerIcon,
  FanIcon,
  FlameIcon,
  ForkKnifeIcon,
  GarageIcon,
  HouseLineIcon,
  ImagesIcon,
  MapPinIcon,
  MoneyIcon,
  MoonStarsIcon,
  OvenIcon,
  PawPrintIcon,
  PlugsIcon,
  SignOutIcon,
  SnowflakeIcon,
  SunIcon,
  SwimmingPoolIcon,
  ThermometerIcon,
  TreeIcon,
  WashingMachineIcon,
  WheelchairIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";

const icons = {
  back: ArrowLeftIcon,
  bath: BathtubIcon,
  bed: BedIcon,
  calendar: CalendarBlankIcon,
  car: CarIcon,
  check: CheckIcon,
  close: XIcon,
  dishes: ForkKnifeIcon,
  external: ArrowUpRightIcon,
  fan: FanIcon,
  flame: FlameIcon,
  garage: GarageIcon,
  hanger: CoatHangerIcon,
  home: HouseLineIcon,
  laundry: WashingMachineIcon,
  location: MapPinIcon,
  money: MoneyIcon,
  next: ArrowRightIcon,
  oven: OvenIcon,
  paw: PawPrintIcon,
  photos: ImagesIcon,
  plugs: PlugsIcon,
  pool: SwimmingPoolIcon,
  signout: SignOutIcon,
  snowflake: SnowflakeIcon,
  sun: SunIcon,
  theme: MoonStarsIcon,
  thermometer: ThermometerIcon,
  tree: TreeIcon,
  wheelchair: WheelchairIcon,
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
      aria-hidden="true"
      className={`app-icon ${className}`}
      focusable="false"
      size={size}
      weight="regular"
    />
  );
}

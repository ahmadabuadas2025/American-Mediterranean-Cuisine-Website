import type { Calendar, MenuItem, Package, Rules, Settings, Zones } from './schemas';

export type MenuEntry = MenuItem & { id: string };
export type PackageEntry = Package & { id: string };

/** Everything the order builder and the order functions need, derived from src/content. */
export interface Catalog {
  menu: MenuEntry[];
  packages: PackageEntry[];
  rules: Rules;
  zones: Zones;
  calendar: Calendar;
  settings: Settings;
}

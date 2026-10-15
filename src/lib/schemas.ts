/**
 * Content schemas. Shared by Astro content collections (pages), the catalog
 * build script (server functions) and the order builder, so a price or rule is
 * defined once in src/content and validated the same way everywhere.
 */
import { z } from 'zod';

export const DIETARY = ['V', 'VG', 'GF-friendly'] as const;
export const dietaryTag = z.enum(DIETARY);

export const MENU_CATEGORIES = ['mains', 'salads', 'dips', 'mezze', 'carbs', 'sides'] as const;
export const menuCategory = z.enum(MENU_CATEGORIES);

/** Roles an item can fill inside a lunchbox / family box / tray package slot. */
export const BOX_ROLES = ['main', 'veg-main', 'salad', 'appetizer', 'dip', 'side', 'carb'] as const;
export const boxRole = z.enum(BOX_ROLES);

const media = {
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  /** true while the image is an AI/placeholder illustration rather than real food photography */
  illustrative: z.boolean().default(true),
};

export const menuItemSchema = z.object({
  name: z.string(),
  category: menuCategory,
  description: z.string(),
  priceHalf: z.number().nonnegative(),
  priceFull: z.number().nonnegative(),
  servesHalf: z.string().default('5–6'),
  servesFull: z.string().default('10–12'),
  /** midpoint servings used for the builder's serving estimate */
  servingsHalf: z.number().default(5.5),
  servingsFull: z.number().default(11),
  dietary: z.array(dietaryTag).default([]),
  allergenNote: z.string().optional(),
  boxRoles: z.array(boxRole).default([]),
  available: z.boolean().default(true),
  approved: z.boolean().default(false),
  sortOrder: z.number().default(100),
  ...media,
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const slotSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().min(1),
  roles: z.array(boxRole).min(1),
});
export type Slot = z.infer<typeof slotSchema>;

export const PACKAGE_KINDS = ['box', 'family', 'tray-package', 'event-tier'] as const;

export const packageSchema = z.object({
  name: z.string(),
  kind: z.enum(PACKAGE_KINDS),
  summary: z.string(),
  /** null means "custom / quoted" */
  price: z.number().nonnegative().nullable(),
  priceUnit: z.enum(['box', 'package', 'guest', 'quote']),
  serves: z.string().optional(),
  /** midpoint servings used by the builder (trays/family) */
  servings: z.number().optional(),
  minGuests: z.number().int().optional(),
  traySize: z.enum(['half', 'full']).optional(),
  inclusions: z.array(z.string()).default([]),
  /** selectable slots; empty means fixed contents */
  slots: z.array(slotSchema).default([]),
  /** builds a custom order → always routed to a quote */
  custom: z.boolean().default(false),
  dietary: z.array(dietaryTag).default([]),
  featured: z.boolean().default(false),
  available: z.boolean().default(true),
  approved: z.boolean().default(false),
  sortOrder: z.number().default(100),
  ...media,
});
export type Package = z.infer<typeof packageSchema>;

export const faqSchema = z.object({
  question: z.string(),
  answer: z.string(),
  category: z.enum(['Ordering', 'Lead time', 'Delivery', 'Servings', 'Dietary', 'Payment', 'Changes', 'Events']),
  top: z.boolean().default(false),
  sortOrder: z.number().default(100),
});
export type Faq = z.infer<typeof faqSchema>;

export const pageSchema = z.object({
  title: z.string(),
  description: z.string(),
  draft_notice: z.string().optional(),
  updated: z.string().optional(),
});

const SERVICE_TYPES = ['individual', 'office', 'family', 'trays', 'event'] as const;
export const serviceType = z.enum(SERVICE_TYPES);
export type ServiceType = z.infer<typeof serviceType>;
export { SERVICE_TYPES };

const perType = <T extends z.ZodType>(t: T) =>
  z.object({ individual: t, office: t, family: t, trays: t, event: t });

export const rulesSchema = z.object({
  approved: z.boolean().default(false),
  timezone: z.string().default('America/New_York'),
  /** standard lead time per service type */
  leadTimeHours: perType(z.number().nonnegative()),
  /** below the lead time but at/above this, the order is a rush request (quote); below it is a conflict */
  rushFloorHours: perType(z.number().nonnegative()),
  rushFeePercent: z.object({ min: z.number(), max: z.number() }),
  minimums: z.object({
    individualBoxes: z.number().int().min(1),
    officeMeals: z.number().int().min(1),
    officeSubtotal: z.number().nonnegative(),
    familyBoxes: z.number().int().min(1),
    trayItems: z.number().int().min(1),
  }),
  /** above these, orders route to a quote */
  unusualQuantity: z.object({
    boxes: z.number().int(),
    familyBoxes: z.number().int(),
    trays: z.number().int(),
    eventGuests: z.number().int(),
  }),
  setupFee: z.object({ min: z.number(), max: z.number(), note: z.string() }),
  eventDeposit: z.object({ percent: z.number(), balanceDueBusinessDays: z.number() }),
  /** null until the owner confirms tax treatment */
  taxRatePercent: z.number().nullable(),
  timeWindows: z.array(z.object({ start: z.string(), label: z.string() })),
  occasions: z.array(z.string()),
  eventAddOns: z.array(z.object({ key: z.string(), label: z.string(), note: z.string() })),
  cancellationPolicy: z.string(),
  finalCountDeadline: z.string(),
});
export type Rules = z.infer<typeof rulesSchema>;

export const zonesSchema = z.object({
  approved: z.boolean().default(false),
  zones: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().default(''),
      zips: z.array(z.string()).default([]),
      deliveryFee: z.number().nullable(),
      minimumSubtotal: z.number().nullable(),
    }),
  ),
  outOfZoneNote: z.string(),
});
export type Zones = z.infer<typeof zonesSchema>;

export const calendarSchema = z.object({
  blackoutDates: z.array(z.object({ date: z.string(), reason: z.string().default('') })).default([]),
  fullyBookedDates: z.array(z.string()).default([]),
  /** weekdays the kitchen does not deliver, 0 = Sunday */
  closedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
});
export type Calendar = z.infer<typeof calendarSchema>;

export const settingsSchema = z.object({
  businessName: z.string(),
  brandLine: z.string(),
  serviceAreaLabel: z.string(),
  serviceAreaDetail: z.string(),
  phone: z.string(),
  email: z.string(),
  hours: z.array(z.object({ days: z.string(), hours: z.string() })).default([]),
  responseExpectation: z.string(),
  pickup: z.object({ enabled: z.boolean(), address: z.string(), instructions: z.string() }),
  socials: z.object({
    instagram: z.string(),
    facebook: z.string(),
    tiktok: z.string(),
    googleBusinessProfile: z.string(),
  }),
  pricingNotice: z.string(),
  showPricingNotice: z.boolean().default(true),
  dietaryMarkersStatus: z.enum(['proposed', 'approved']),
  dietaryDisclaimer: z.string(),
  map: z.object({ lat: z.number(), lng: z.number(), zoom: z.number() }),
  hero: z.object({
    videoWebm: z.string().optional(),
    videoMp4: z.string().optional(),
    videoMobileMp4: z.string().optional(),
    poster: z.string(),
    posterAlt: z.string(),
  }),
  ogImage: z.string(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const gallerySchema = z.object({
  items: z.array(
    z.object({
      src: z.string(),
      alt: z.string(),
      caption: z.string().default(''),
      illustrative: z.boolean().default(true),
    }),
  ),
});

export const bannersSchema = z.object({
  announcement: z.object({ enabled: z.boolean(), text: z.string(), link: z.string().default('') }),
});

/** Owner placeholders look like "TODO-OWNER" and are hidden on the site. */
export const isSet = (v: string | null | undefined): v is string =>
  !!v && v.trim() !== '' && !v.trim().toUpperCase().startsWith('TODO');

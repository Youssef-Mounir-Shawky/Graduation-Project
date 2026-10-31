import { z } from "zod";

const entityId = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
}).strict();

export const readingSchema = z.object({
  node_id: entityId,
  zone: entityId,
  moisture: z.number().finite().nullable().optional(),
  temp: z.number().finite().nullable().optional(),
  shortwave_radiation_w_m2: z.number().finite().nullable().optional(),
  humidity: z.number().finite().nullable().optional(),
  battery_mv: z.number().int().min(0).max(10_000),
  seq: z.number().int().min(1),
  gateway_id: entityId,
  timestamp: z.iso.datetime().optional(),
}).strict();

export const overrideSchema = z.object({
  valve_state: z.enum(["on", "off"]),
}).strict();

const zoneFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  crop_id: entityId,
  soil_type: z.enum(["loam", "sandy"]),
  growth_stage: z.string().trim().min(1).max(80),
  planting_date: z.iso.date(),
  moisture_target_min_percent: z.number().min(0).max(100),
  moisture_target_max_percent: z.number().min(0).max(100),
}).strict();

export const createZoneSchema = zoneFieldsSchema.refine((zone) => zone.moisture_target_min_percent < zone.moisture_target_max_percent, {
  message: "The minimum moisture target must be lower than the maximum.",
  path: ["moisture_target_min_percent"],
});

export const patchZoneSchema = zoneFieldsSchema.partial().strict().refine(
  (zone) => zone.moisture_target_min_percent === undefined
    || zone.moisture_target_max_percent === undefined
    || zone.moisture_target_min_percent < zone.moisture_target_max_percent,
  { message: "The minimum moisture target must be lower than the maximum.", path: ["moisture_target_min_percent"] },
).refine((changes) => Object.keys(changes).length > 0, "At least one zone field must be supplied.");

export const createNodeSchema = z.object({
  id: entityId.optional(),
  zone_id: entityId,
  gateway_id: entityId,
}).strict();

export const patchNodeSchema = z.object({
  zone_id: entityId.optional(),
  gateway_id: entityId.optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, "At least one node field must be supplied.");

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  phone_number: z.string().trim().min(7).max(32).regex(/^[+0-9().\-\s]+$/),
  password: z.string().min(12).max(128),
  role: z.enum(["admin", "operator"]),
}).strict();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().max(254).optional(),
  phone_number: z.string().trim().min(7).max(32).regex(/^[+0-9().\-\s]+$/).optional(),
  password: z.string().min(12).max(128).optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, "At least one user field must be supplied.");

export const readingsQuerySchema = z.object({
  zone_id: entityId.optional(),
  hours: z.coerce.number().int().min(1).max(24 * 183).default(24),
  limit: z.coerce.number().int().min(1).max(10_000).default(500),
}).strict();

export const weatherQuerySchema = z.object({
  location: z.string().min(1).max(80).optional(),
  zone_id: entityId.optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).strict().refine(
  (query) => (query.latitude === undefined) === (query.longitude === undefined),
  { message: "Latitude and longitude must be provided together.", path: ["latitude"] },
).refine(
  (query) => query.latitude === undefined || query.location === undefined,
  { message: "Choose a preset location or provide coordinates, not both.", path: ["location"] },
);

export const zoneParamsSchema = z.object({ zoneId: entityId });
export const nodeParamsSchema = z.object({ nodeId: entityId });
export const userParamsSchema = z.object({ userId: entityId });

export const registerNodeSchema = z.object({
  node_id: entityId.optional(),
  zone_id: entityId,
}).strict();

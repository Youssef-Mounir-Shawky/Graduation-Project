CREATE TEMP TABLE seed_entity_renames (
  old_zone_id TEXT PRIMARY KEY,
  new_zone_id TEXT NOT NULL,
  old_node_id TEXT NOT NULL,
  new_node_id TEXT NOT NULL,
  old_schedule_id TEXT NOT NULL,
  new_schedule_id TEXT NOT NULL,
  old_crop_id TEXT NOT NULL,
  old_soil_id TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO seed_entity_renames (
  old_zone_id, new_zone_id, old_node_id, new_node_id,
  old_schedule_id, new_schedule_id, old_crop_id, old_soil_id
)
SELECT zone.id,
       'zone-' || crop_slug.value || '-' || soil_slug.value,
       node.id,
       'node-' || crop_slug.value || '-' || soil_slug.value,
       COALESCE(schedule.id, 'schedule-' || substring(zone.id FROM 6)),
       'schedule-' || crop_slug.value || '-' || soil_slug.value,
       crop.id,
       soil.id
FROM nileguard.zones AS zone
JOIN nileguard.crops AS crop ON crop.id = zone.crop_id
JOIN nileguard.soil_types AS soil ON soil.id = zone.soil_type_id
JOIN nileguard.nodes AS node ON node.zone_id = zone.id
LEFT JOIN LATERAL (
  SELECT irrigation_schedule.id
  FROM nileguard.irrigation_schedule
  WHERE irrigation_schedule.zone_id = zone.id
  ORDER BY irrigation_schedule.id
  LIMIT 1
) AS schedule ON true
CROSS JOIN LATERAL (
  SELECT CASE WHEN crop.id = 'potato' THEN 'potato' ELSE 'tomato' END AS value
) AS crop_slug
CROSS JOIN LATERAL (
  SELECT CASE WHEN soil.id = 'sandy' THEN 'sandy' ELSE 'loam' END AS value
) AS soil_slug
WHERE crop.id NOT IN ('tomato', 'potato')
   OR soil.id NOT IN ('loam', 'sandy');

UPDATE nileguard.crops
SET id = 'tomato',
    name = 'Tomato',
    moisture_threshold_percent = 35,
    moisture_target_min_percent = 40,
    moisture_target_max_percent = 70,
    stages = ARRAY['seedling', 'vegetative', 'flowering', 'fruiting', 'maturity']
WHERE id IN (
  SELECT DISTINCT old_crop_id
  FROM seed_entity_renames
  WHERE old_crop_id <> 'potato'
);

UPDATE nileguard.soil_types
SET id = 'loam',
    name = 'Loam soil'
WHERE id IN (
  SELECT DISTINCT old_soil_id
  FROM seed_entity_renames
  WHERE old_soil_id <> 'sandy'
);

UPDATE nileguard.zones AS zone
SET name = initcap(split_part(mapping.new_zone_id, '-', 2))
           || ' · '
           || initcap(split_part(mapping.new_zone_id, '-', 3))
           || ' soil',
    moisture_target_min_percent = CASE
      WHEN mapping.new_zone_id LIKE 'zone-tomato-%' THEN 40
      ELSE zone.moisture_target_min_percent
    END,
    moisture_target_max_percent = CASE
      WHEN mapping.new_zone_id LIKE 'zone-tomato-%' THEN 70
      ELSE zone.moisture_target_max_percent
    END,
    growth_stage = CASE
      WHEN mapping.new_zone_id = 'zone-tomato-sandy' THEN 'flowering'
      ELSE zone.growth_stage
    END
FROM seed_entity_renames AS mapping
WHERE zone.id = mapping.old_zone_id;

INSERT INTO nileguard.zones (
  id, name, crop_id, soil_type_id, growth_stage, planting_date,
  moisture_target_min_percent, moisture_target_max_percent, created_at
)
SELECT mapping.new_zone_id, zone.name, zone.crop_id, zone.soil_type_id,
       zone.growth_stage, zone.planting_date, zone.moisture_target_min_percent,
       zone.moisture_target_max_percent, zone.created_at
FROM seed_entity_renames AS mapping
JOIN nileguard.zones AS zone ON zone.id = mapping.old_zone_id;

INSERT INTO nileguard.nodes (
  id, zone_id, gateway_id, last_seen_at, battery_mv, last_sequence, created_at
)
SELECT mapping.new_node_id, mapping.new_zone_id, node.gateway_id, node.last_seen_at,
       node.battery_mv, node.last_sequence, node.created_at
FROM seed_entity_renames AS mapping
JOIN nileguard.nodes AS node ON node.id = mapping.old_node_id;

INSERT INTO nileguard.valve_controls (zone_id, state, mode, updated_at, updated_by)
SELECT mapping.new_zone_id, valve.state, valve.mode, valve.updated_at, valve.updated_by
FROM seed_entity_renames AS mapping
JOIN nileguard.valve_controls AS valve ON valve.zone_id = mapping.old_zone_id;

DELETE FROM nileguard.sensor_readings AS reading
USING seed_entity_renames AS mapping
WHERE reading.zone_id = mapping.old_zone_id
  AND reading.data_source = 'synthetic';

UPDATE nileguard.sensor_readings AS reading
SET zone_id = mapping.new_zone_id,
    node_id = mapping.new_node_id
FROM seed_entity_renames AS mapping
WHERE reading.zone_id = mapping.old_zone_id;

UPDATE nileguard.irrigation_schedule AS schedule
SET id = mapping.new_schedule_id,
    zone_id = mapping.new_zone_id
FROM seed_entity_renames AS mapping
WHERE schedule.id = mapping.old_schedule_id
  AND schedule.zone_id = mapping.old_zone_id;

DELETE FROM nileguard.valve_controls AS valve
USING seed_entity_renames AS mapping
WHERE valve.zone_id = mapping.old_zone_id;

DELETE FROM nileguard.nodes AS node
USING seed_entity_renames AS mapping
WHERE node.id = mapping.old_node_id;

DELETE FROM nileguard.zones AS zone
USING seed_entity_renames AS mapping
WHERE zone.id = mapping.old_zone_id;

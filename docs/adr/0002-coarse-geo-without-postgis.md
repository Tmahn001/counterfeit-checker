# ADR-0002: Coarse geolocation stored without PostGIS

**Status:** Accepted · **Date:** 2026-09-18

## Context

Plan §11.2 suggests a PostGIS `Point` for `TelemetryEvent.geo_coarse` ("PostGIS optional"). The
privacy requirement (§11.3, §13) is that telemetry can never de-anonymise a small market: geo is
LGA-level, never GPS-precise.

## Decision

Store `state_code`, `lga_code` and coordinates rounded to two decimals (`geo_lat`, `geo_lng`,
≈1.1 km) as plain columns on PostgreSQL 15. Rounding happens **on the client** (`lib/telemetry/geo.ts`)
and the serializer rejects anything more precise (`DecimalField(decimal_places=2)`), so the server
is physically unable to store a precise fix. Aggregates for the NAFDAC dashboard are grouped by
`(product_category, state_code, verdict)` and cells below `DASHBOARD_K_ANONYMITY` (default 5) are
suppressed.

## Consequences

- No GDAL/GEOS in the Django image; smaller build, simpler CI.
- Spatial joins (e.g. LGA polygons) can be added later with PostGIS without a data migration of the
  coarse columns; the LGA code table ships with the client so attribution works offline.

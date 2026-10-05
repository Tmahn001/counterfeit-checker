# API contract (v1)

Live schema: `GET /api/v1/schema/` (OpenAPI 3) · Swagger UI in non-prod: `/api/v1/schema/swagger-ui/`.

| Endpoint                      | Method   | Auth                  | Purpose                                                                                                           |
| ----------------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/api/v1/health/`             | GET      | –                     | Liveness (DB round-trip)                                                                                          |
| `/api/v1/oem/auth/login/`     | POST     | –                     | Session login for OEM members                                                                                     |
| `/api/v1/oem/auth/logout/`    | POST     | OEM session           |                                                                                                                   |
| `/api/v1/oem/auth/me/`        | GET      | OEM session           | Membership + account                                                                                              |
| `/api/v1/oem/baselines/`      | GET/POST | OEM uploader/admin    | List / upload reference set (multipart, 5–200 images) → 202 + job status                                          |
| `/api/v1/oem/baselines/{id}/` | GET      | OEM member            | Status polling; includes embedding when `ready`                                                                   |
| `/api/v1/products/`           | GET      | –                     | Product catalogue + READY baseline signatures for the active model (embeddings and ORB descriptors, never images) |
| `/api/v1/models/latest/`      | GET      | –                     | Active `ModelVersion` (manifest URL, baselines URL, threshold)                                                    |
| `/api/v1/models/`             | GET      | –                     | Published versions changelog                                                                                      |
| `/api/v1/telemetry/`          | POST     | rate-limited, no auth | Anonymised incident ingestion (strict allowlist)                                                                  |
| `/api/v1/dashboard/summary/`  | GET      | `nafdac` group        | k-anonymised aggregates (`?days=`)                                                                                |

**No endpoint accepts a consumer photograph.** The only image-accepting endpoint is the OEM baseline
upload, restricted to authenticated OEM uploaders and used for manufacturer reference sets.
Shared TypeScript types: `packages/shared-types/src/index.ts`.

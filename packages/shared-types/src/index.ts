/**
 * Contracts shared between the PWA (`apps/web`) and the Django API (`apps/api`).
 * Keep in sync with `apps/api/<app>/serializers.py` and `ml/src/authentic_edge_ml/params.py`.
 */

export type Verdict = 'authentic' | 'counterfeit' | 'inconclusive';
export type InferenceBackend = 'webgl' | 'wasm' | 'cpu' | 'webgpu';

/** ORB / matching parameters embedded in `model.json` (plan §8.3, §21.2). */
export interface OrbParams {
  readonly n_keypoints: number;
  readonly fast_threshold: number;
  readonly scale_factor: number;
  readonly n_levels: number;
  readonly edge_threshold: number;
  readonly patch_size: number;
  readonly hamming_threshold: number;
  readonly lowe_ratio: number;
}

export interface PreprocessParams {
  readonly clahe_clip_limit: number;
  readonly clahe_tile_grid: number;
  /** 'nlm' (Non-Local Means, needs the OpenCV `photo` module) or 'bilateral' (v1 default, see ADR-0004). */
  readonly denoise_method: 'nlm' | 'bilateral';
  readonly bilateral_d: number;
  readonly bilateral_sigma_color: number;
  readonly bilateral_sigma_space: number;
  readonly nlm_h: number;
  readonly nlm_template_window: number;
  readonly nlm_search_window: number;
  readonly roi_fraction: number;
  readonly input_size: number;
}

export interface DecisionParams {
  readonly threshold: number;
  readonly cnn_weight: number;
  readonly inconclusive_band: number;
  readonly min_orb_matches: number;
}

/** `userDefinedMetadata` block written by `ml/src/authentic_edge_ml/conversion/export_tfjs.py`. */
export interface ModelMetadata {
  readonly modelVersion: string;
  readonly inputSize: number;
  readonly embeddingDim: number;
  readonly margin: number;
  readonly decisionThreshold: number;
  readonly orb: OrbParams;
  readonly preprocess: PreprocessParams;
  readonly decision: DecisionParams;
  readonly weightsSha256?: string;
}

/** One entry of `baselines.json` — the OEM reference signature for a product category. */
export interface BaselineSignature {
  readonly product_category: string;
  readonly display_name: string;
  /** 128-dim, L2-normalised. */
  readonly embedding: readonly number[];
  /** base64(uint8[N,32]) rBRIEF descriptors of the medoid reference image. */
  readonly orb_descriptors_b64: string;
  readonly orb_keypoint_count: number;
  readonly image_count: number;
}

export interface BaselinesBundle {
  readonly version: string;
  readonly modelVersion: string;
  readonly baselines: readonly BaselineSignature[];
}

/** GET /api/v1/models/latest/ */
export interface ModelVersionResponse {
  readonly version_string: string;
  readonly release_notes: string;
  readonly tfjs_manifest_url: string;
  readonly baselines_url: string;
  readonly weights_sha256: string;
  readonly input_size: number;
  readonly embedding_dim: number;
  readonly margin: number;
  readonly published_at: string | null;
}

/**
 * Coarse location: LGA-level codes plus coordinates rounded to two decimals (~1.1 km).
 * Precise GPS never appears in this type — see `apps/web/lib/telemetry/types.ts`.
 */
export interface CoarseGeo {
  readonly state_code: string;
  readonly lga_code: string;
  readonly geo_lat_2dp: number;
  readonly geo_lng_2dp: number;
}

/** POST /api/v1/telemetry/ — strictly allowlisted, no image bytes, no precise location. */
export interface TelemetryPayload {
  readonly product_category: string;
  readonly verdict: Verdict;
  readonly model_confidence_score: number;
  readonly distance?: number;
  readonly state_code?: string;
  readonly lga_code?: string;
  readonly geo_lat_2dp?: number;
  readonly geo_lng_2dp?: number;
  readonly model_version: string;
  readonly backend?: InferenceBackend;
  readonly inference_ms?: number;
  readonly timestamp: string;
}

/** GET /api/v1/dashboard/summary/ */
export interface DashboardSummary {
  readonly since: string;
  readonly total_events: number;
  readonly counterfeit_rate: number;
  readonly k_anonymity: number;
  readonly by_category_state: readonly {
    readonly product_category: string;
    readonly state_code: string;
    readonly verdict: Verdict;
    readonly count: number;
    readonly mean_confidence: number;
  }[];
  readonly by_model_version: Readonly<Record<string, number>>;
}

/** OEM portal contracts. */
export interface OEMAccount {
  readonly id: number;
  readonly company_name: string;
  readonly contact_email: string;
  readonly verified_at: string | null;
  readonly created_at: string;
}
export interface OEMMe {
  readonly email: string;
  readonly role: 'admin' | 'uploader';
  readonly account: OEMAccount;
}
export type BaselineStatus = 'pending' | 'running' | 'ready' | 'failed';
export interface ProductBaseline {
  readonly id: string;
  readonly product_category: string;
  readonly model_version: string;
  readonly status: BaselineStatus;
  readonly error_message: string;
  readonly image_count: number;
  readonly created_at: string;
  readonly completed_at: string | null;
}

/** Product catalogue (static seed: /catalogue/v1/products.json; live: GET /api/v1/products/). */
export type ProductSector = 'food_beverage' | 'pharmaceutical' | 'personal_care' | 'demo';
export interface Product {
  readonly slug: string;
  readonly display_name: string;
  readonly manufacturer: string;
  readonly pack: string;
  readonly sector: ProductSector;
}
export interface ProductCatalogueFile {
  readonly version: string;
  readonly products: readonly Product[];
}
export interface DistributedBaseline {
  readonly embedding: readonly number[];
  readonly orb_descriptors_b64: string;
  readonly image_count: number;
  readonly model_version: string;
  readonly completed_at: string | null;
}
export interface ProductCatalogueResponse {
  readonly model_version: string | null;
  readonly products: readonly (Product & { readonly baseline: DistributedBaseline | null })[];
}

/** GET /api/v1/auth/me/ and POST /api/v1/auth/login/ */
export type ConsoleRole = 'staff' | 'nafdac' | 'oem_admin' | 'oem_uploader';
export interface SessionUser {
  readonly email: string;
  readonly roles: readonly ConsoleRole[];
}

/**
 * demSampler.ts — LIDAR/DEM Tile Fetcher and Elevation Sampler
 * =============================================================
 *
 * Instead of querying USGS EPQS once per node (which is slow and
 * hammers the API), this module fetches a single GeoTIFF tile covering
 * the entire project area from the USGS 3DEP service, decodes it in
 * the browser using the `geotiff` library, and exposes a fast local
 * sampling function.
 *
 * ## Data Source
 *
 * USGS 3DEP (3D Elevation Program) — 1/3 arc-second (~10m) DEM
 * WCS endpoint: https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer
 *
 * We request a GeoTIFF in EPSG:4326 (WGS84 lat/lng) so the pixel
 * coordinates align directly with geographic coordinates, making
 * sampling trivial (no reprojection needed).
 *
 * ## How Raster Sampling Works
 *
 * A GeoTIFF stores elevation values as a 2D grid of pixels.
 * Given a lat/lng and the tile's bounding box + pixel dimensions:
 *
 *   col = (lng - minLng) / (maxLng - minLng) * width   (pixels from left)
 *   row = (maxLat - lat) / (maxLat - minLat) * height  (pixels from top)
 *
 * Note: row increases downward in raster coordinates but latitude
 * increases upward — hence (maxLat - lat), not (lat - minLat).
 *
 * Then we look up the pixel at [row, col] to get the elevation in feet.
 * The 3DEP WCS returns values in METERS, so we multiply by 3.28084.
 */

import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "geotiff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Bounding box in geographic coordinates (WGS84 / EPSG:4326).
 * All values in decimal degrees.
 */
export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * A loaded DEM tile that can be sampled at arbitrary lat/lng points.
 * Create one via `loadDemTile()`, then call `.sampleElevationFt()` freely.
 */
export interface DemTile {
  /** The geographic extent of this tile. */
  bbox: BoundingBox;
  /**
   * Sample the elevation at a given lat/lng coordinate.
   *
   * @param lat - Latitude in decimal degrees (WGS84)
   * @param lng - Longitude in decimal degrees (WGS84)
   * @returns Elevation in feet above sea level, or null if the point
   *          falls outside the tile or the raster value is a nodata sentinel.
   */
  sampleElevationFt: (lat: number, lng: number) => number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * USGS 3DEP WCS (Web Coverage Service) endpoint.
 * We use WCS 1.0.0 because it is the most widely supported version
 * and returns a clean GeoTIFF with embedded georeferencing.
 */
const USGS_WCS_URL =
  "https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer";

/**
 * The WCS coverage identifier for the 1/3 arc-second (~10m) national DEM.
 * Other available coverages include "DEP3Elevation_1" (1m, limited coverage).
 */
const COVERAGE_ID = "DEP3Elevation";

/**
 * Conversion factor from meters (returned by 3DEP WCS) to feet.
 * 1 meter = 3.28084 feet (exact to 5 decimal places).
 */
const METERS_TO_FEET = 3.28084;

/**
 * Nodata sentinel value used by the 3DEP GeoTIFF.
 * Pixels with this value have no elevation data (ocean, outside coverage, etc.).
 * We return null instead of exposing this value to callers.
 */
const NODATA_VALUE = -9999;

// ---------------------------------------------------------------------------
// Main Functions
// ---------------------------------------------------------------------------

/**
 * Fetches a GeoTIFF DEM tile from the USGS 3DEP WCS service for the given
 * bounding box and decodes it into a `DemTile` that can be sampled locally.
 *
 * This should be called ONCE when a user imports their project boundary.
 * The returned DemTile should be stored in component state and reused
 * for all subsequent elevation lookups — do not call this per node.
 *
 * @param bbox - Geographic bounding box of the area to fetch
 * @param widthPx - Pixel width of the returned raster (default 512)
 * @param heightPx - Pixel height of the returned raster (default 512)
 * @returns A DemTile ready for sampling, or null if fetch/decode fails
 */
export async function loadDemTile(
  bbox: BoundingBox,
  widthPx = 512,
  heightPx = 512
): Promise<DemTile | null> {
  try {
    // Build the WCS GetCoverage request URL.
    // WCS 1.0.0 uses BBOX=minX,minY,maxX,maxY in the CRS's native axis order.
    // For EPSG:4326 that is: minLng,minLat,maxLng,maxLat.
    const params = new URLSearchParams({
      SERVICE: "WCS",
      VERSION: "1.0.0",
      REQUEST: "GetCoverage",
      COVERAGE: COVERAGE_ID,
      CRS: "EPSG:4326",
      BBOX: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      WIDTH: String(widthPx),
      HEIGHT: String(heightPx),
      FORMAT: "GeoTIFF",
    });

    const url = `${USGS_WCS_URL}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[demSampler] WCS fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    // The response body is raw GeoTIFF binary data.
    const arrayBuffer = await response.arrayBuffer();

    // Parse the GeoTIFF using the `geotiff` library.
    const tiff: GeoTIFF = await fromArrayBuffer(arrayBuffer);
    const image: GeoTIFFImage = await tiff.getImage();

    // Read the first raster band (band 1 = elevation, 0-indexed internally).
    // readRasters() returns a TypedArray per band.
    const rasters = await image.readRasters({ interleave: false });
    // Band 1 is index 0 in the array — rasters[0] is a TypedArray of pixel values
    const elevationBand = rasters[0] as Float32Array | Int16Array | Uint16Array;

    // The actual pixel dimensions of the returned image
    // (may differ from requested if WCS clips to coverage boundary)
    const actualWidth = image.getWidth();
    const actualHeight = image.getHeight();

    // Return the DemTile with a closure over the raster data
    return {
      bbox,
      sampleElevationFt(lat: number, lng: number): number | null {
        // ---------------------------------------------------------------
        // Bounds check: return null if the point is outside this tile
        // ---------------------------------------------------------------
        if (
          lng < bbox.minLng ||
          lng > bbox.maxLng ||
          lat < bbox.minLat ||
          lat > bbox.maxLat
        ) {
          return null;
        }

        // ---------------------------------------------------------------
        // Convert lat/lng to pixel coordinates
        //
        // col: fraction of the way from left (west) edge to right (east) edge
        //   col = (lng - minLng) / (maxLng - minLng) * width
        //
        // row: fraction of the way from top (north) edge to bottom (south) edge
        //   IMPORTANT: raster rows increase downward, but latitude increases
        //   upward. So we subtract lat from maxLat (not minLat).
        //   row = (maxLat - lat) / (maxLat - minLat) * height
        // ---------------------------------------------------------------
        const col = Math.floor(
          ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * actualWidth
        );
        const row = Math.floor(
          ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * actualHeight
        );

        // Clamp to valid pixel range (floating point can produce out-of-range indices)
        const clampedCol = Math.max(0, Math.min(col, actualWidth - 1));
        const clampedRow = Math.max(0, Math.min(row, actualHeight - 1));

        // 1D index into the flat pixel array: row * width + col
        const pixelIndex = clampedRow * actualWidth + clampedCol;
        const valueMeters = elevationBand[pixelIndex];

        // Return null for nodata pixels
        if (valueMeters === undefined || valueMeters <= NODATA_VALUE) {
          return null;
        }

        // Convert meters to feet
        return valueMeters * METERS_TO_FEET;
      },
    };
  } catch (err) {
    console.error("[demSampler] Failed to load DEM tile:", err);
    return null;
  }
}

/**
 * Expands a bounding box by a given margin in decimal degrees.
 * Used to add a small buffer around the project boundary before fetching
 * the DEM tile, ensuring edge nodes don't fall outside the raster.
 *
 * @param bbox - Original bounding box
 * @param marginDeg - Margin to add on all sides in decimal degrees (default 0.01 ≈ ~1km)
 * @returns Expanded bounding box
 */
export function expandBbox(bbox: BoundingBox, marginDeg = 0.01): BoundingBox {
  return {
    minLng: bbox.minLng - marginDeg,
    minLat: bbox.minLat - marginDeg,
    maxLng: bbox.maxLng + marginDeg,
    maxLat: bbox.maxLat + marginDeg,
  };
}

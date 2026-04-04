/**
 * geoImport — Shapefile (.zip) and GeoJSON parsing utilities
 * ===========================================================
 *
 * ## Purpose
 *
 * Provides two functions for the M4 boundary-import feature:
 *
 *   1. `parseUploadedFile()` — accepts a File from an <input type="file">
 *      and returns a GeoJSON FeatureCollection. Handles both binary
 *      shapefile .zip packages (via shpjs) and plain-text .geojson/.json
 *      files. Returns null on any parse error so callers can show
 *      user-friendly feedback without crashing.
 *
 *   2. `getBoundingBox()` — accepts a FeatureCollection and returns the
 *      outermost [minLng, minLat] / [maxLng, maxLat] bounding box.
 *      Used to auto-fit the Leaflet map after import. Returns null for
 *      empty collections.
 *
 * ## File format detection
 *
 * We detect format by file extension (case-insensitive):
 *   - ".zip"  → binary shapefile package  → shpjs.parseArrayBuffer()
 *   - ".geojson" / ".json" → plain JSON → JSON.parse()
 *
 * Both formats ultimately yield a GeoJSON FeatureCollection, so the
 * rest of the M4 pipeline is format-agnostic.
 *
 * ## Shapefile note
 *
 * A valid shapefile .zip must contain at minimum .shp, .shx, and .dbf
 * members. shpjs handles the decompression internally (using jszip).
 * The projection is assumed to be WGS84 (EPSG:4326) — no reprojection
 * is performed. If the user's shapefile uses a different CRS they
 * should pre-project it to WGS84 before uploading.
 */

import type { FeatureCollection } from "geojson";

/**
 * Parses an uploaded boundary file into a GeoJSON FeatureCollection.
 *
 * Supports:
 *   - Shapefile .zip  (containing .shp/.shx/.dbf/.prj members)
 *   - Plain GeoJSON .geojson or .json
 *
 * @param file - The File object from an <input type="file"> change event
 * @returns A GeoJSON FeatureCollection, or null if parsing fails
 */
export async function parseUploadedFile(file: File): Promise<FeatureCollection | null> {
  try {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".zip")) {
      // --------------------------------------------------------------
      // Shapefile: use shpjs to parse the binary zip archive.
      // shpjs is exported as a callable function (export = shpjs pattern).
      // shpjs(buffer) returns Promise<FeatureCollection | FeatureCollection[]>.
      // We take the first item if it's an array.
      // Dynamic import avoids SSR issues in Next.js.
      // --------------------------------------------------------------
      const shpjsModule = await import("shpjs");
      // shpjsModule.default is the callable shpjs function per the types
      const shpjs = (shpjsModule as unknown as { default: (base: ArrayBuffer | Buffer | { buffer: ArrayBuffer }) => Promise<FeatureCollection | FeatureCollection[]> }).default;
      const buffer = await file.arrayBuffer();
      const result = await shpjs(buffer);
      // shpjs can return a single FeatureCollection or an array of them
      const geojson = Array.isArray(result) ? result[0] : result;
      return geojson as FeatureCollection;
    } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
      // --------------------------------------------------------------
      // Plain GeoJSON: parse the text content as JSON.
      // We trust the user has uploaded a valid FeatureCollection.
      // --------------------------------------------------------------
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      // Basic guard: ensure it quacks like a GeoJSON FeatureCollection
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        (parsed as Record<string, unknown>).type === "FeatureCollection" &&
        Array.isArray((parsed as Record<string, unknown>).features)
      ) {
        return parsed as FeatureCollection;
      } else {
        console.error("[geoImport] Parsed JSON is not a valid FeatureCollection:", parsed);
        return null;
      }
    } else {
      console.error("[geoImport] Unsupported file extension:", file.name);
      return null;
    }
  } catch (err) {
    // Graceful degradation: any parse error returns null rather than
    // crashing. The caller (ImportButton) will show an inline error
    // message so the user knows to check their file format.
    console.error("[geoImport] Failed to parse uploaded file:", err);
    return null;
  }
}

/**
 * Computes the outermost bounding box of a GeoJSON FeatureCollection.
 *
 * Iterates every feature in the collection and tracks the global min/max
 * of longitude and latitude across all geometry types (Point, LineString,
 * Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection).
 * GeometryCollection children are flattened recursively.
 *
 * Leaflet's fitBounds() accepts [[minLat, minLng], [maxLat, maxLng]],
 * but this function returns [[minLng, minLat], [maxLng, maxLat]] — callers
 * must swap the coordinate order when calling fitBounds().
 *
 * @param fc - A GeoJSON FeatureCollection
 * @returns [[minLng, minLat], [maxLng, maxLat]] or null if empty
 */
export function getBoundingBox(
  fc: FeatureCollection
): [[number, number], [number, number]] | null {
  if (!fc.features || fc.features.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  /**
   * Recursively visits every coordinate pair in any GeoJSON geometry.
   * Flattens GeometryCollection, Multi* types, and handles Polygons
   * (which have rings — exterior ring first, then holes).
   *
   * @param geom - Any GeoJSON geometry object
   */
  function visitGeometry(geom: GeoJSON.Geometry): void {
    if (geom.type === "Point") {
      const [lng, lat] = geom.coordinates as [number, number];
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    } else if (geom.type === "MultiPoint" || geom.type === "LineString") {
      for (const coord of geom.coordinates as GeoJSON.Position[]) {
        const [lng, lat] = coord;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    } else if (geom.type === "MultiLineString" || geom.type === "Polygon") {
      // Polygon[0] = exterior ring; Polygon[1..] = holes; MultiLineString has multiple lines
      for (const line of geom.coordinates as GeoJSON.Position[][]) {
        for (const coord of line) {
          const [lng, lat] = coord;
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as GeoJSON.Position[][][]) {
        for (const ring of poly) {
          for (const coord of ring) {
            const [lng, lat] = coord;
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          }
        }
      }
    } else if (geom.type === "GeometryCollection") {
      if (geom.geometries) {
        for (const child of geom.geometries) {
          visitGeometry(child);
        }
      }
    }
    // Unknown type: skip silently
  }

  for (const feature of fc.features) {
    if (feature.geometry) {
      visitGeometry(feature.geometry);
    }
  }

  if (!isFinite(minLng)) return null; // empty collection

  return [[minLng, minLat], [maxLng, maxLat]];
}

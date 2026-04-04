/**
 * Fetch ground elevation for a lat/lng from USGS EPQS (Elevation Point Query Service).
 * Returns elevation in feet, or null on error.
 */
export async function fetchPointElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&units=Feet&includeDate=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    // v1 response: { value: number, location: {...}, ... }
    const value = json?.value;
    if (value === undefined || value === null) return null;
    return parseFloat(String(value));
  } catch {
    return null;
  }
}

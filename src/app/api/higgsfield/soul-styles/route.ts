/**
 * Higgsfield Soul Styles API Route
 *
 * Proxies GET /v1/text2image/soul-styles from Higgsfield
 * to fetch available style presets. Results are cached in-memory.
 *
 * GET /api/higgsfield/soul-styles
 *
 * Headers:
 *   - X-Higgsfield-Key: API key in key:secret format
 *
 * Response:
 *   { success: true, styles: SoulStyle[], cached: boolean }
 */

import { NextRequest, NextResponse } from "next/server";

const HIGGSFIELD_BASE = "https://platform.higgsfield.ai";

export interface SoulStyle {
  id: string;
  name: string;
  description: string | null;
  preview_url: string;
}

export interface SoulStyleGroup {
  category: string;
  styles: SoulStyle[];
}

interface SoulStylesSuccessResponse {
  success: true;
  styles: SoulStyle[];
  groups: SoulStyleGroup[];
  cached: boolean;
}

interface SoulStylesErrorResponse {
  success: false;
  error: string;
}

// In-memory cache (10 minute TTL)
let cachedStyles: SoulStyle[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Category mapping for Soul Styles.
 * Maps style names to categories for grouped dropdown rendering.
 * Styles not found here go into "Other".
 */
const STYLE_CATEGORIES: Record<string, string[]> = {
  "General": ["General", "Realistic", "iPhone", "Movie", "Artwork"],
  "Camera & Lens Effects": ["360 cam", "Fisheye", "CCTV", "DigitalCam", "0.5 Selfie"],
  "Retro & Era": ["Y2K", "2000s Fashion", "90s Grain", "90's Editorial", "Medieval"],
  "Fashion & Beauty": ["FashionShow", "Bimbocore", "Coquette core", "Gorpcore", "Grunge"],
  "Makeup & Close-ups": ["Babydoll MakeUp", "Bleached Brows", "Grillz Selfie", "RingSelfie"],
  "Locations & Scenes": ["Tokyo Streetstyle", "Amalfi Summer", "Library", "Subway", "Gallery"],
  "Beach & Outdoors": ["Sunset beach", "Night Beach", "Sunbathing", "Sand"],
  "Weather & Mood": ["Foggy Morning", "Rainy Day", "Sunburnt"],
  "Poses & Actions": ["Sitting on the Street", "Crossing the street", "Eating Food"],
  "Digital & Glitch Art": ["Glitch", "PixeletedFace", "Invertethereal"],
  "Artistic & Mixed Media": ["Avant-garde", "Mixed Media", "Paper Face", "Graffiti"],
  "Internet & Nostalgia": ["Tumblr", "Rhyme & blues"],
  "Fantasy & Surreal": ["Fairycore", "Angel Wings", "Creatures", "Swords Hill"],
  "Surreal Scale": ["Giant People", "Giant Accessory", "Long legs", "Duplicate"],
  "Lighting & Contrast": ["Spotlight", "Through The Glass"],
};

// Build a reverse lookup: style name -> category
const styleToCategoryMap = new Map<string, string>();
for (const [category, names] of Object.entries(STYLE_CATEGORIES)) {
  for (const name of names) {
    styleToCategoryMap.set(name.toLowerCase(), category);
  }
}

/**
 * Categorize a style by name. Falls back to "Other" if not in the mapping.
 */
export function categorizeStyle(styleName: string): string {
  return styleToCategoryMap.get(styleName.toLowerCase()) || "Other";
}

/**
 * Group styles by category, ordered by the STYLE_CATEGORIES order.
 */
export function groupStylesByCategory(styles: SoulStyle[]): { category: string; styles: SoulStyle[] }[] {
  const grouped = new Map<string, SoulStyle[]>();

  for (const style of styles) {
    const cat = categorizeStyle(style.name);
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(style);
  }

  // Order by STYLE_CATEGORIES key order, then "Other" at the end
  const orderedCategories = Object.keys(STYLE_CATEGORIES);
  const result: { category: string; styles: SoulStyle[] }[] = [];

  for (const cat of orderedCategories) {
    const items = grouped.get(cat);
    if (items && items.length > 0) {
      result.push({ category: cat, styles: items });
      grouped.delete(cat);
    }
  }

  // Add remaining ("Other" and any unmatched)
  for (const [cat, items] of grouped) {
    if (items.length > 0) {
      result.push({ category: cat, styles: items });
    }
  }

  return result;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<SoulStylesSuccessResponse | SoulStylesErrorResponse>> {
  const apiKey = request.headers.get("X-Higgsfield-Key") || process.env.HIGGSFIELD_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Higgsfield API key required." },
      { status: 401 }
    );
  }

  // Return cached styles if still valid
  if (cachedStyles && Date.now() - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json({ success: true, styles: cachedStyles, groups: groupStylesByCategory(cachedStyles), cached: true });
  }

  try {
    const response = await fetch(`${HIGGSFIELD_BASE}/v1/text2image/soul-styles`, {
      headers: {
        "Authorization": `Key ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Higgsfield] Failed to fetch soul styles: ${response.status} - ${errorText}`);
      // If we have stale cached data, return it as fallback
      if (cachedStyles) {
        return NextResponse.json({ success: true, styles: cachedStyles, groups: groupStylesByCategory(cachedStyles), cached: true });
      }
      return NextResponse.json(
        { success: false, error: `Failed to fetch soul styles: ${response.status}` },
        { status: response.status }
      );
    }

    const styles: SoulStyle[] = await response.json();
    cachedStyles = styles;
    cacheTimestamp = Date.now();

    return NextResponse.json({ success: true, styles, groups: groupStylesByCategory(styles), cached: false });
  } catch (error) {
    console.error("[Higgsfield] Error fetching soul styles:", error);
    // Return stale cache on network error
    if (cachedStyles) {
      return NextResponse.json({ success: true, styles: cachedStyles, groups: groupStylesByCategory(cachedStyles), cached: true });
    }
    return NextResponse.json(
      { success: false, error: "Failed to fetch soul styles" },
      { status: 500 }
    );
  }
}

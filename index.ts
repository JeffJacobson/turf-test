import {} from "@turf/turf";
import type { FeatureCollection, MultiLineString } from "geojson";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// const sampleRouteAttributes = {
//   OBJECTID: 1,
//   DISPLAY: "2",
//   RT_TYPEA: "US",
//   RT_TYPEB: 2,
//   LRS_Date: "20211231",
//   RouteID: "002",
//   StateRouteNumber: "002",
//   RelRouteType: "",
//   RelRouteQual: "",
//   SHAPE_Length: 6.1811609982518618,
// };

/**
 * Represents the data structure for a sample data object with various route-related properties.
 */
interface RouteAttributes {
  /** Unique object identifier. */
  OBJECTID: number;
  /** Display string. */
  DISPLAY: string;
  /** Route type A. */
  RT_TYPEA: string;
  /** Route type B as a number. */
  RT_TYPEB: number;
  /** Date associated with the Linear Referencing System (LRS). */
  LRS_Date: `${number}`;
  /** Identifier for the route. */
  RouteID: string;
  /** State route number. */
  StateRouteNumber: string;
  /**
   * Related Route Type (RRT)
   */
  RelRouteType: string | null;
  /** Qualifier for the related route type. */
  RelRouteQual: string | null;
  /** Length of the shape or route geometry. */
  SHAPE_Length: number;
}

type FilteredRouteAttributes = Pick<RouteAttributes, "RouteID">;

type RouteFeatureCollection = FeatureCollection<
  MultiLineString,
  RouteAttributes
>;

const fieldsToDrop: (keyof RouteAttributes)[] = [
  "OBJECTID",
  "DISPLAY",
  "RT_TYPEA",
  "RT_TYPEB",
  "LRS_Date",
  "StateRouteNumber",
  "RelRouteType",
  "RelRouteQual",
  "SHAPE_Length",
];

/**
 * A reviver function for JSON.parse that filters out specified fields.
 *
 * @this - The object being parsed. {@link key} is the name of a property of this object.
 * @param key - The key being parsed from the JSON input.
 * @return - The parsed value for the given key, or undefined if it should be filtered out.
 */
const reviver: Parameters<typeof JSON.parse>[1] = function (
  this: unknown,
  key,
  value: unknown
) {
  if ((fieldsToDrop as string[]).includes(key)) {
    return undefined;
  }
  return value;
};

// Locate the "data" folder, which contains the GeoJSON files,
// relative to this file you are reading.
const thisFile = fileURLToPath(import.meta.url);
const folder = dirname(thisFile);
const dataFolder = join(folder, "data");

// Get a list of the files in the "data" folder.
const files = await readdir(dataFolder, {
  withFileTypes: true,
  recursive: true,
});

/**
 * Matches strings that end with `.geojson`,
 * case-insensitive.
 */
const geojsonRe = /\.geojson$/i;

// Filter out non-file entries and non-GeoJSON files.
const geojsonFiles = files.filter(
  (dirent) => dirent.isFile() && geojsonRe.test(dirent.name)
);

/**
 * Asynchronously reads a GeoJSON file and returns the parsed FeatureCollection.
 *
 * @param f - the dirent object representing the file
 * @return the parsed GeoJSON FeatureCollection
 */
async function readGeoJson(f: Dirent) {
  const s = await readFile(join(f.path, f.name), {
    encoding: "utf-8",
  });

  return [
    f.name.replace(geojsonRe, ""),
    JSON.parse(s, reviver) as RouteFeatureCollection,
  ] as [typeof f.name, RouteFeatureCollection];
}
// Read the GeoJSON files and parse.
const promises = geojsonFiles.map(readGeoJson);

/**
 * Generates an iterator over the features in the given FeatureCollection,
 * yielding a tuple containing the route ID and geometry for each feature.
 *
 * @param fc - The FeatureCollection to enumerate
 * @return An iterator over the route ID and geometry tuples
 */
function* enumerateFeatures(
  name: string,
  fc: FeatureCollection<MultiLineString, FilteredRouteAttributes>
) {
  for (const feature of fc.features) {
    const routeId = feature.properties.RouteID;
    const geometry = feature.geometry;
    yield [name, routeId, geometry] as [
      name: typeof name,
      routeId: typeof routeId,
      geometry: typeof geometry
    ];
  }
}

for await (const featureCollection of promises) {
  for (const [name, routeId /*g*/] of [
    ...enumerateFeatures(...featureCollection),
  ]
    .filter(([, , g]) => g.coordinates.length > 1)
    .sort()) {
    console.log(name, routeId);
  }
}

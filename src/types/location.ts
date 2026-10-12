/**
 * Where our groups train (owner, 2026-10-12: "Right now we are only at
 * Newtonbrook Tennis Club in North York"; "People need to choose location
 * first"). A location is first-class data: every group belongs to one, the
 * /programs catalog starts with the choice, and enrollment names it first.
 *
 * Only what the owner gave is held: the club's name and its area. No street
 * address, hours or court counts until the owner provides them; the map link
 * is a Google Maps search for the club's name, never an invented address.
 */
export type TrainingLocation = {
  /** Stable id: ProgramGroup.locationId and the catalog's ?location= value. */
  id: string;
  /** The club as players say it: "Newtonbrook Tennis Club". */
  name: string;
  /** Neighbourhood and city, for a second line: "North York, Toronto". */
  area: string;
  /** Structured data only (PostalAddress, no streetAddress): "North York". */
  locality: string;
  /** Structured data only: the province code, "ON". */
  region: string;
  /** Structured data only: the country code, "CA". */
  country: string;
  /** A Google Maps search link for the club (mapsSearchUrl). */
  mapsUrl: string;
};

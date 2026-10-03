import { describe, expect, it } from "vitest";
import {
  buildMapEmbedUrl,
  buildMapSearchUrl,
  getMapEmbedKey,
  parseMap,
} from "./map";
import { hashContent, rawLines } from "./parse";

describe("parse helpers", () => {
  it("rawLines drops blanks and trims", () => {
    expect(rawLines("  a  \n\n  b \n")).toEqual(["a", "b"]);
    expect(rawLines("")).toEqual([]);
  });

  it("hashes content deterministically", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});

describe("parseMap", () => {
  it("parses an address into name and address parts", () => {
    const data = parseMap(
      "SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan",
    );
    expect(data?.query).toBe(
      "SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan",
    );
    expect(data?.zoom).toBe(15);
    expect(data?.label).toBeNull();
    expect(data?.title).toBe("SAS Supermarket");
    expect(data?.address).toBe("Marshal Baghramyan Ave 85, Yerevan");
  });

  it("parses coordinates without splitting an address line", () => {
    const data = parseMap("40.1772, 44.5126");
    expect(data?.query).toBe("40.1772, 44.5126");
    expect(data?.title).toBe("40.1772, 44.5126");
    expect(data?.address).toBeNull();
  });

  it("parses optional zoom and label keys", () => {
    const data = parseMap(
      "SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan\nzoom=12 | label=My Store",
    );
    expect(data?.zoom).toBe(12);
    expect(data?.label).toBe("My Store");
    expect(data?.title).toBe("My Store");
    expect(data?.address).toBe("Marshal Baghramyan Ave 85, Yerevan");
  });

  it("returns null for an empty block", () => {
    expect(parseMap("")).toBeNull();
    expect(parseMap("   \n  \n")).toBeNull();
  });

  it("tolerates extra whitespace around fields and keys", () => {
    const data = parseMap(
      "  SAS Supermarket ,  Marshal Baghramyan Ave 85  \n  zoom=  12  |  label=  My Store  ",
    );
    expect(data?.query).toBe("SAS Supermarket ,  Marshal Baghramyan Ave 85");
    expect(data?.zoom).toBe(12);
    expect(data?.label).toBe("My Store");
  });

  it("strips surrounding quotes and keeps special characters", () => {
    const data = parseMap(
      '"SAS Supermarket, Marshal Baghramyan Ave 85"\nlabel=\'My "Central" Store\'',
    );
    expect(data?.query).toBe("SAS Supermarket, Marshal Baghramyan Ave 85");
    expect(data?.label).toBe('My "Central" Store');
    const special = parseMap("Café Central & Co., Yerevan #1?");
    expect(special?.query).toBe("Café Central & Co., Yerevan #1?");
  });

  it("falls back to zoom 15 and clamps out-of-range values", () => {
    expect(parseMap("Yerevan\nzoom=abc")?.zoom).toBe(15);
    expect(parseMap("Yerevan\nzoom=99")?.zoom).toBe(21);
    expect(parseMap("Yerevan\nzoom=0")?.zoom).toBe(1);
    expect(parseMap("Yerevan")?.zoom).toBe(15);
  });

  it("ignores unknown keys and extra lines", () => {
    const data = parseMap("Yerevan\nfoo=bar | zoom=14\nignored third line");
    expect(data?.zoom).toBe(14);
    expect(data?.label).toBeNull();
  });
});

describe("map URL builders", () => {
  it("encodes the query for the keyless embed URL", () => {
    const url = buildMapEmbedUrl(
      "SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan",
      15,
    );
    expect(url).toBe(
      `https://www.google.com/maps?q=${encodeURIComponent("SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan")}&z=15&output=embed`,
    );
  });

  it("encodes quotes and special characters", () => {
    const query = 'Café "Central" & Co. #1?';
    expect(buildMapEmbedUrl(query, 12)).toContain(encodeURIComponent(query));
    expect(buildMapSearchUrl(query)).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    );
  });

  it("uses the v1 place endpoint when a key is present", () => {
    const url = buildMapEmbedUrl("Yerevan", 14, "test-key");
    expect(url).toBe(
      `https://www.google.com/maps/embed/v1/place?key=test-key&q=${encodeURIComponent("Yerevan")}&zoom=14`,
    );
  });

  it("reads the key from the project env convention", () => {
    const prev = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = "  env-key  ";
    expect(getMapEmbedKey()).toBe("env-key");
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = prev;
    }
    expect(buildMapEmbedUrl("Yerevan", 15, getMapEmbedKey())).toContain(
      "output=embed",
    );
  });
});

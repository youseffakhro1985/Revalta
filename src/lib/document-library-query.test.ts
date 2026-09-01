import { describe, expect, it } from "vitest";
import { DOCUMENT_LIBRARY_MAX_PAGE_SIZE, DOCUMENT_LIBRARY_PAGE_SIZE, parseDocumentLibraryQuery } from "./document-library-query";

describe("parseDocumentLibraryQuery", () => {
  it("uses conservative defaults", () => {
    expect(parseDocumentLibraryQuery("https://revalta.test/api/documents/library")).toEqual({
      page: 1,
      pageSize: DOCUMENT_LIBRARY_PAGE_SIZE,
      search: "",
      category: "",
      propertyId: "",
      visibility: "",
      lifecycle: "",
      sort: "newest",
      focus: "all",
    });
  });

  it("bounds page size and text inputs", () => {
    const value = parseDocumentLibraryQuery(`https://revalta.test/api/documents/library?page=-8&pageSize=9999&search=${"a".repeat(260)}`);
    expect(value.page).toBe(1);
    expect(value.pageSize).toBe(DOCUMENT_LIBRARY_MAX_PAGE_SIZE);
    expect(value.search).toHaveLength(200);
  });

  it("accepts supported filters and rejects unknown enum values", () => {
    const valid = parseDocumentLibraryQuery("https://revalta.test/api/documents/library?sort=expiry&focus=attention&lifecycle=active&visibility=resident_property&category=ovk&propertyId=property-1");
    expect(valid).toMatchObject({
      sort: "expiry",
      focus: "attention",
      lifecycle: "active",
      visibility: "resident_property",
      category: "ovk",
      propertyId: "property-1",
    });

    const invalid = parseDocumentLibraryQuery("https://revalta.test/api/documents/library?sort=random&focus=secret&lifecycle=deleted&visibility=public");
    expect(invalid).toMatchObject({ sort: "newest", focus: "all", lifecycle: "", visibility: "" });
  });
});

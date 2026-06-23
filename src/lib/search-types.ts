export type SearchResultType = "tenant" | "room" | "bed" | "complaint" | "payment";

export type GlobalSearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
};


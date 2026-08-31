export type WebsiteEditsRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
};

export type WebsiteEditsBlock =
  | { type: "heading"; level: number; runs: WebsiteEditsRun[] }
  | { type: "paragraph"; runs: WebsiteEditsRun[]; bullet: boolean }
  | { type: "image"; url: string }
  | { type: "table"; rows: string[][] };

export type WebsiteEditsTab = {
  id: string;
  title: string;
  depth: number;
  blocks: WebsiteEditsBlock[];
};

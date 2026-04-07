export interface MediaServerLibrary {
  id: string;
  name: string;
  type: string;
  paths: string[];
}

export interface MediaServerPort {
  testConnection(
    url: string,
    apiKey: string,
  ): Promise<{ serverName: string; version: string }>;

  listLibraries(
    url: string,
    apiKey: string,
  ): Promise<MediaServerLibrary[]>;

  scanLibrary(
    url: string,
    apiKey: string,
    sectionIds?: string[],
  ): Promise<void>;
}

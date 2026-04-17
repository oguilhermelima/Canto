export type HardlinkOrCopyResult = "hardlink" | "copy" | "exists";

export interface FileSystemPort {
  mkdir(dirPath: string, opts?: { recursive?: boolean }): Promise<void>;
  hardlinkOrCopy(source: string, target: string): Promise<HardlinkOrCopyResult>;
}

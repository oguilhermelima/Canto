export type HardlinkOrCopyResult = "hardlink" | "copy" | "exists";

export type FileAccessMode = "read" | "write" | "read-write";

export interface FileSystemDirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileSystemStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
}

export interface FileSystemPort {
  mkdir(dirPath: string, opts?: { recursive?: boolean }): Promise<void>;
  rmdir(dirPath: string): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  readdir(dirPath: string): Promise<FileSystemDirEntry[]>;
  stat(targetPath: string): Promise<FileSystemStats>;
  access(targetPath: string, mode: FileAccessMode): Promise<void>;
  hardlinkOrCopy(source: string, target: string): Promise<HardlinkOrCopyResult>;
}

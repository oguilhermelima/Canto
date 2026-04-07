import type { DownloadClientPort } from "../../domain/ports/download-client";
import { getQBClient } from "./qbittorrent";

/**
 * Returns the configured download client.
 * Currently only qBittorrent is supported. Future clients (Transmission, Deluge)
 * will be selectable via a system setting.
 */
export async function getDownloadClient(): Promise<DownloadClientPort> {
  return getQBClient();
}

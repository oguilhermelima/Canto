import { freemem, totalmem, cpus, loadavg } from "node:os";
import { statfs } from "node:fs/promises";
import { getSetting } from "@canto/db/settings";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { findAllFolders } from "@canto/core/infra/file-organization/folder-repository";
import { getQBClient } from "@canto/core/infra/torrent-clients/qbittorrent.adapter";

export const systemRouter = createTRPCRouter({
  info: adminProcedure.query(async ({ ctx }) => {
    // CPU
    const cpuCount = cpus().length;
    const [load1] = loadavg();
    const cpuUsage = Math.min(100, Math.round(((load1 ?? 0) / cpuCount) * 100));

    // RAM
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    // Local disk — use the first download folder's libraryPath
    let localDisk: { free: number; total: number; path: string } | null = null;
    try {
      const folders = await findAllFolders(ctx.db);
      const libraryPath = folders[0]?.libraryPath;
      if (libraryPath) {
        const stats = await statfs(libraryPath);
        localDisk = {
          free: stats.bavail * stats.bsize,
          total: stats.blocks * stats.bsize,
          path: libraryPath,
        };
      }
    } catch {
      // Path may not exist or be inaccessible
    }

    // qBittorrent disk
    let qbitDisk: { free: number; dlSpeed: number; upSpeed: number } | null = null;
    const qbEnabled = await getSetting("qbittorrent.enabled");
    if (qbEnabled) {
      try {
        const qb = await getQBClient();
        const transfer = await qb.getTransferInfo();
        qbitDisk = {
          free: transfer.freeSpaceOnDisk,
          dlSpeed: transfer.dlSpeed,
          upSpeed: transfer.upSpeed,
        };
      } catch {
        // qBittorrent unreachable
      }
    }

    return {
      cpu: { cores: cpuCount, usage: cpuUsage },
      ram: { total: totalMem, used: usedMem, free: freeMem },
      localDisk,
      qbitDisk,
    };
  }),
});

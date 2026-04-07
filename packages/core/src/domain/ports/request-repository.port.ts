import type { downloadRequest, media } from "@canto/db/schema";

type RequestRow = typeof downloadRequest.$inferSelect;
type RequestInsert = typeof downloadRequest.$inferInsert;
type MediaRow = typeof media.$inferSelect;

type RequestWithMedia = RequestRow & { media: MediaRow | null };
type RequestWithMediaAndUser = RequestRow & {
  media: MediaRow | null;
  user: { id: string; name: string; email: string } | null;
};

export interface RequestRepositoryPort {
  createDownloadRequest(data: RequestInsert): Promise<RequestRow | undefined>;
  findRequestsByUser(userId: string, status?: string): Promise<RequestWithMedia[]>;
  findRequestsByUserPaginated(
    userId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: RequestWithMedia[]; total: number }>;
  findAllRequests(status?: string): Promise<RequestWithMediaAndUser[]>;
  findAllRequestsPaginated(
    opts: { limit: number; offset: number },
  ): Promise<{ items: RequestWithMediaAndUser[]; total: number }>;
  findRequestById(id: string): Promise<RequestWithMedia | undefined>;
  resolveRequest(
    id: string,
    data: { status: "approved" | "rejected"; adminNote?: string; resolvedBy: string },
  ): Promise<RequestRow | undefined>;
  updateRequestStatus(mediaId: string, status: string): Promise<void>;
  revertRequestStatus(mediaId: string, fromStatus: string, toStatus: string): Promise<void>;
  cancelRequest(id: string, userId: string): Promise<RequestRow | undefined>;
}

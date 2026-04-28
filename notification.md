# Notification subsystem — design backlog

Single source of truth for notification UX requirements that have been
deferred. When the notification subsystem is built, every requirement
listed here gets a concrete channel/route/payload mapping.

> Status: not started. Each entry below blocks a downstream feature.

---

## Pending requirements

### Repack auto-supersede (Phase 6a)

**What triggered the requirement.** The repack auto-supersede BullMQ
job (`apps/worker/src/jobs/repack-supersede.ts`) replaces a downloaded
torrent with a higher-`repackCount` candidate when group/quality/source
match. Today the swap is silent. Users need to know:

- Which media was superseded.
- Old release vs new release (titles, repack counts).
- Whether the old file was deleted or kept.
- Failure modes (replace attempted but qBittorrent refused, indexer
  candidate disappeared, profile rejected the swap).

**Channel preference.** In-app feed (per-user). Push/email is overkill
for a repack swap. The notification should be dismissable and link to
the media detail page.

**Payload sketch.**
```ts
{
  kind: "repack-superseded",
  mediaId: uuid,
  oldTorrentId: uuid,
  newTorrentId: uuid,
  oldTitle: string,
  newTitle: string,
  oldRepackCount: number,
  newRepackCount: number,
  outcome: "replaced" | "kept-both" | "failed",
  failureReason?: string,
}
```

**Where it should fire from.** `replace.ts` after the swap commits, or
the supersede job after `replaceTorrent` returns. Prefer the job —
manual replacements (user-initiated from the download modal) are
already visible to the user.

**Acceptance.** User opens the app the next morning, sees a chip
"3 movies upgraded overnight", clicks → list of swaps with diff. Can
revert (re-download the old release).

---

## Notes for whoever builds the subsystem

- Notifications are user-scoped. Repack supersede triggers for a media
  the user owns; resolve `userId` from `mediaFile.ownership` (or
  whatever the equivalent is once libraries get formal ownership).
- Idempotency matters. If the supersede job retries, it must not emit a
  duplicate notification for the same `(oldTorrentId, newTorrentId)`
  pair.
- Opt-out per kind. A user who doesn't care about repack swaps should
  be able to silence them without silencing the whole feed.
- Web first, mobile later (no mobile app today; design for mobile parity
  but don't block on it).

---

## Adding new entries

When you defer a notification requirement, append a section here with:

1. **What triggered the requirement** — the feature/use case.
2. **Channel preference** — in-app / push / email / digest, with a one-line reason.
3. **Payload sketch** — minimal TS shape.
4. **Where it should fire from** — call site.
5. **Acceptance** — user-visible outcome.

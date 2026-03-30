# Canto — Roadmap

## Quality System

### Quality Profiles (foundation ready)
- Table `quality_profile` exists with `qualities[]` + `cutoff`
- Field `media.qualityProfileId` FK exists
- Rules in `domain/rules/quality.ts` (hierarchy, detect, compare)
- **TODO**: UI to create/edit profiles
- **TODO**: Wire profile into download decision (reject below cutoff)
- **TODO**: Default profile per library

### Auto-Upgrade Check
- `isUpgrade()` function exists in quality.ts
- **TODO**: Scheduled job that checks library items against quality profile
- **TODO**: If current file < cutoff, search + download upgrade
- **TODO**: Replace old file after successful import

### Custom Formats / Decision Engine
- **TODO**: Define custom format rules (codec, resolution, group, language)
- **TODO**: Score-based ranking beyond confidence (prefer x265, prefer specific groups)
- **TODO**: Rejection reasons ("wrong language", "below minimum quality")

## Automation

### RSS Sync
- **TODO**: Job `rss-sync` — poll indexer RSS feeds on schedule
- **TODO**: Match against monitored shows (continuousDownload enabled)
- **TODO**: Auto-download matching releases

### Continuous Download (v2)
- Basic trigger implemented (next episode after import)
- **TODO**: Check `nextAirDate` proactively (not just post-import)
- **TODO**: Season pack detection (if full season available, prefer pack over singles)

## Notifications

### Notification Providers
- Table `notification` exists, `create-notification.ts` use case writes to it
- Events wired: import success, download failure, movie multi-file skip
- **TODO**: Email provider (SMTP config in settings)
- **TODO**: Telegram provider (bot token + chat ID)
- **TODO**: Discord provider (webhook URL)
- **TODO**: Push notifications (web push / Expo push)

### Notification UI
- **TODO**: In-app notification bell with unread count
- **TODO**: Mark as read / dismiss
- **TODO**: Notification preferences (which events, which providers)

## Subtitle System

### Subtitle Provider Integration
- Import from torrents implemented (detect + rename + move)
- Language parsing from filenames (`*.en.srt`, `*.pt-BR.srt`)
- **TODO**: OpenSubtitles API integration (search by IMDB ID + hash)
- **TODO**: Auto-download missing subtitles post-import
- **TODO**: Language preferences per user

## Import Pipeline

### Archive Extraction
- **TODO**: Detect .rar/.zip in torrent files
- **TODO**: Extract to temp dir before organizing
- Requires 7z/unrar binary in container

### Hardlink Support
- Currently uses qBit `setLocation` (move) or SSH `cp` (copy)
- **TODO**: Try hardlink first, fall back to copy
- **TODO**: Configurable per library (hardlink vs copy vs move)

### Rollback Tracking
- Basic try-catch exists in import-torrent.ts
- **TODO**: Track moved/renamed files in array
- **TODO**: On failure, reverse moves and clean up orphaned files

## Usenet

### SABnzbd Support
- `TorrentClientPort` interface ready for alternative download clients
- `torrent.usenet` field exists in schema
- **TODO**: SABnzbd adapter (HTTP API: add NZB, check status, get files)
- **TODO**: NZB indexer support in Prowlarr adapter
- **TODO**: Import pipeline adaptation for Usenet downloads

## Media Management

### Bulk Import from Disk
- **TODO**: Scan directory for media files
- **TODO**: Match filenames against TMDB
- **TODO**: Create media + media_file records
- **TODO**: UI for review + confirm

### Image Caching
- Currently uses TMDB CDN URLs directly
- **TODO**: Download poster/backdrop/logo to local filesystem on persist
- **TODO**: Serve via Next.js image optimization
- **TODO**: Periodic cleanup of orphaned images

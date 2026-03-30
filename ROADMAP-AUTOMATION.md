# Roadmap: Automation & Import Engine

Features do código antigo (Python) que precisam ser portadas, melhorias sobre o que já existia, e features novas inspiradas no Sonarr/Radarr.

**Legenda**: ✅ já existe no Canto | 🔧 existe parcialmente | ❌ falta implementar

---

## 1. Import Pipeline (portar do código antigo)

### 1.1 File Naming com nome da mídia ❌

Hoje: `S01E01 - [1080p Blu-Ray].mkv`
Antigo: `Show Name S01E01 - suffix.mkv`
Ideal: `I Parry Everything (2024) - S01E01 - [1080p Blu-Ray].mkv`

Sem o título no filename, Jellyfin e providers de legenda não conseguem resolver. Uma linha no auto-import.

### 1.2 Subtitle Import ❌

O código antigo importava `.srt` junto com os vídeos, detectando idioma pelo padrão `*.en.srt`, `*.pt-BR.srt`.

- Detectar arquivos `.srt`/`.ass`/`.sub` no torrent
- Extrair código de idioma do nome (`[. ]([A-Za-z]{2})[. ]srt`)
- Copiar pro mesmo diretório com naming Jellyfin: `Show Name S01E01.pt-BR.srt`
- Suportar múltiplos idiomas por episódio

### 1.3 Archive Extraction ❌

O código antigo extraía 7z, RAR, ZIP antes de importar (via `patoolib`). Torrents de anime frequentemente vêm com arquivos comprimidos.

- Detectar arquivos de archive no torrent (7z, rar, zip, tar.gz)
- Extrair antes do import usando child_process (`7z x`, `unrar x`)
- Re-escanear arquivos após extração
- Cleanup dos archives após extração bem-sucedida

### 1.4 Hardlink com fallback pra copy ❌

O código antigo usava hardlink (economiza espaço, torrent continua seeding do mesmo arquivo) com fallback pra copy quando cross-filesystem.

Hoje usamos `setLocation` do qBittorrent que **move** os arquivos. Isso funciona mas:
- Se o torrent e a library estão no mesmo filesystem, hardlink seria melhor
- Move quebra o seeding se não for feito via qBit API

**Decisão**: manter `setLocation` + `renameFile` (funciona com qBit seeding) mas adicionar opção de hardlink pra quem quer manter o original intacto.

### 1.5 Rollback on Import Failure ❌

O código antigo rastreava todos os arquivos copiados e diretórios criados, e fazia cleanup completo em caso de erro.

- Trackear `copiedFiles[]` e `createdDirectories[]` durante import
- No catch: deletar arquivos, remover diretórios vazios (reverse order)
- Resetar `importing = false` no torrent record (já fazemos isso)
- Log detalhado de cada rollback action

### 1.6 Movie Import com validação ❌

O código antigo validava que movies tinham exatamente 1 arquivo de vídeo. Se tivesse múltiplos, enviava notificação e falhava.

- Validar contagem de vídeos antes de importar
- Se múltiplos: logar warning + notificar (não importar automaticamente)
- Se nenhum: logar erro + notificar

---

## 2. Scheduled Tasks (portar + melhorar)

### 2.1 Import sweep a cada 2 minutos 🔧

O código antigo rodava `import_all_torrents` a cada 2 minutos. O Canto tem o `import-torrents` job mas ele roda integrado ao `listLive` (sob demanda quando alguém abre a página de torrents).

- Garantir que o job `import-torrents` roda como repeatable a cada 2 minutos independente de UI
- Não depender de `listLive` pra detectar completions

### 2.2 Metadata refresh semanal ❌

O código antigo atualizava metadata de shows não-finalizados toda segunda-feira.

- Job `refresh-metadata` no worker (BullMQ repeatable, weekly)
- Atualizar shows onde `status !== "Ended"` e `inLibrary = true`
- Atualizar filmes onde `inLibrary = true` e metadata tem mais de 30 dias
- Detectar novos episódios e seasons adicionados

### 2.3 Continuous Download (auto-download novos episódios) ✅

Já existe: `continuousDownload` flag por mídia. O worker deveria buscar episódios novos (air date recente) sem arquivo e triggerar download.

- Verificar se o job existente realmente funciona end-to-end
- Integrar com quality profiles quando implementados

---

## 3. Quality & Scoring (novo + inspirado no antigo)

### 3.1 Quality Profiles ❌

O código antigo tinha quality enum + scoring rules por library. Sonarr/Radarr expandem isso com profiles completos.

- Tabela `quality_profile` com nome e lista ordenada de qualidades aceitas
- Hierarquia: `SD < 720p < 1080p WEB-DL < 1080p Blu-Ray < 2160p WEB-DL < 2160p Remux`
- **Cutoff**: qualidade a partir da qual para de fazer upgrade
- Qualidades agrupáveis (WEB-DL e WEBRip 1080p = equivalentes)
- Profile atribuído por library (default) com override por mídia
- UI em Settings para criar/editar profiles

### 3.2 Decision Engine (Release Scoring) ❌

O código antigo tinha title rules + flag rules com score modifiers por library. Sonarr/Radarr expandem com custom formats.

- **Custom Formats**: regras regex que tagueiam releases
  - Condições: título regex, codec, áudio, HDR, release group, tamanho, indexer flags
  - Score numérico no quality profile (+150 HEVC, +100 Atmos, -200 hardcoded subs)
- **Scoring total**: quality tier + custom format scores
- **Rejection reasons**: mostrar no interactive search por que um release foi rejeitado
- **Negation support**: regra aplica quando keyword NÃO presente (do código antigo)

### 3.3 Automatic Upgrades ❌

- Job `upgrade-check` (BullMQ repeatable, a cada 6h)
- Varre mídia com arquivo abaixo do cutoff → busca → decision engine → grab
- Ao completar, substitui arquivo antigo (reusa flow de replace)
- Setting global + per-mídia pra habilitar/desabilitar
- Log de upgrades no histórico

---

## 4. Background Automation (novo, inspirado Sonarr)

### 4.1 RSS Sync ❌

- Job `rss-sync` (BullMQ repeatable, a cada 15min configurável)
- Fetch RSS feeds dos indexers → parse → match contra mídia monitorada → decision engine → grab
- **Delay profiles** (fase 2): segurar grab por X horas pra esperar releases melhores

### 4.2 Failed Download Handling ❌

- **Blocklist**: release falho → adicionado à blocklist
- **Auto-retry**: busca próximo melhor release (excluindo blocklist)
- Stalled por mais de X horas → marca como falho → retry
- Retry limit: máximo 3 tentativas
- UI de blocklist management

---

## 5. Notification System (portar do antigo)

### 5.1 Multi-provider Notifications ❌

O código antigo tinha 4 providers: Email (SMTP), Gotify, Ntfy, Pushover.

- Interface `NotificationProvider` com `send(title, message)`
- Providers: Email, Gotify, Ntfy, Pushover, Discord webhook, Telegram bot
- Configuração em Settings com test de cada provider
- Todos os providers habilitados recebem simultaneamente

### 5.2 Eventos que geram notificação ❌

- Import de episódio/filme com sucesso
- Import falhou (arquivo não encontrado, multiple files, etc.)
- Download completado
- Download falhou (stalled, error)
- Upgrade aplicado
- Metadata atualizado (novos episódios detectados)
- Health check: serviço não disponível (qBit, Jellyfin, Plex offline)

### 5.3 In-app Notifications ❌

O código antigo tinha tabela de notificações com status read/unread. O Canto tem um ícone de notificação no topbar mas sem backend.

- Tabela `notification` (title, message, type, read, created_at)
- Badge counter no topbar
- Dropdown com lista de notificações recentes
- Mark as read / mark all as read

---

## 6. Subtitle System (novo)

### 6.1 Subtitle Import from Torrents 🔧

O código antigo importava .srt do torrent. O novo não faz.

- Detectar .srt/.ass/.sub no torrent durante auto-import
- Extrair idioma do filename
- Renomear e mover junto com o vídeo
- Jellyfin/Plex pegam automaticamente

### 6.2 Subtitle Provider Integration (novo) ❌

Busca automática de legendas quando o torrent não inclui.

- Provider: OpenSubtitles.com (API REST, busca por TMDB ID + hash)
- Provider: Legendas.net (scraping, melhor pra PT-BR)
- Provider: Podnapisi (REST, sem auth, bom acervo multi-idioma)
- Job `fetch-subtitles` no worker: varre mídia sem legenda no idioma preferido
- Configuração de idiomas preferidos em Settings
- Busca manual na media page (botão "Search Subtitle")
- Hash-based matching (primeiros 64KB do arquivo) pra melhor precisão

---

## 7. Import & File Management (melhorias)

### 7.1 Import Candidates (portar do antigo) ❌

O código antigo escaneava diretórios de mídia e sugeria imports baseado em metadata.

- Scan de diretórios que existem no disco mas não estão no banco
- Extrair TMDB/TVDB ID do nome da pasta (padrão `[tmdbid-12345]`)
- Buscar metadata e sugerir match
- UI em Settings: lista de candidatos com botão "Import"

### 7.2 Bulk Import ❌

- Importar múltiplos diretórios de uma vez
- Progress tracking
- Dry-run mode (mostra o que seria importado sem fazer)

### 7.3 File Path Suffix / Quality Variant Tracking ❌

O código antigo rastreava sufixos de qualidade por arquivo (ex: "1080p", "IMPORTED", "4K HDR").

- Campo `quality_suffix` no `media_file`
- Permite múltiplas versões do mesmo episódio (1080p + 4K)
- UI mostra qual versão existe

### 7.4 Episode Deduplication ❌

O código antigo prevenia episode files duplicados (IntegrityError handling).

- Antes de criar `media_file`, verificar se já existe um para aquele `episodeId` com qualidade igual ou superior
- Se inferior: substituir
- Se igual: skip
- Se superior: skip (a menos que upgrade automático)

---

## 8. Usenet Support (futuro)

### 8.1 SABnzbd Integration ❌

O código antigo suportava SABnzbd como download client de Usenet.

- `AbstractDownloadClient` pattern com implementação pra SABnzbd
- Detecção automática: se indexer retorna NZB → usa SABnzbd, senão → qBittorrent
- Status tracking similar ao de torrents
- Import flow idêntico (mesma lógica de rename/move)

---

## Ordem de implementação sugerida

| Fase | Features | Prioridade | Justificativa |
|------|----------|-----------|---------------|
| **1** | 1.1 (naming), 1.2 (subtitles), 1.5 (rollback) | Alta | Corrige problemas atuais de import |
| **2** | 3.1 (quality profiles), 3.2 (decision engine) | Alta | Base pra toda automação |
| **3** | 5.1-5.3 (notifications) | Média | Visibilidade do que tá acontecendo |
| **4** | 4.2 (failed download handling) | Média | Melhora experiência sem automação completa |
| **5** | 2.2 (metadata refresh), 2.1 (import sweep) | Média | Manutenção automática |
| **6** | 4.1 (RSS sync), 3.3 (auto-upgrades) | Média | Automação real — grab automático |
| **7** | 6.1-6.2 (subtitles provider) | Baixa | Feature independente, pode ser plugada depois |
| **8** | 1.3 (archives), 1.4 (hardlink), 7.1 (import candidates) | Baixa | Nice-to-have, edge cases |
| **9** | 8.1 (usenet) | Baixa | Público menor, pode esperar |

---

## Status atual do Canto vs código antigo

| Feature | Antigo (Python) | Canto (TypeScript) |
|---------|----------------|-------------------|
| Import via qBit API (setLocation + rename) | ❌ (hardlink/copy) | ✅ |
| S01E01 pattern matching | ✅ | ✅ |
| Bare episode numbers (anime fansub) | ❌ | ✅ |
| Subtitle import from torrent | ✅ | ❌ |
| Archive extraction (7z/rar) | ✅ | ❌ |
| Rollback on import failure | ✅ | ❌ |
| Hardlink import | ✅ | ❌ (usa move via qBit) |
| Filename includes show title | ✅ | ❌ |
| Multi-library support | ✅ | ✅ |
| Continuous download | ✅ | ✅ |
| Scoring rules per library | ✅ (basic) | ❌ |
| Notifications (4 providers) | ✅ | ❌ |
| Scheduled import every 2min | ✅ | 🔧 (via listLive) |
| Weekly metadata refresh | ✅ | ❌ |
| Import candidates from disk | ✅ | ❌ |
| Movie single-file validation | ✅ | ❌ |
| Plex OAuth flow | ❌ | ✅ |
| Reverse sync (Jellyfin/Plex → Canto) | ❌ | ✅ |
| Media availability badges | ❌ | ✅ |
| Interactive torrent search with filters | ❌ (basic) | ✅ |
| Settings modal per-media | ❌ | ✅ |
| Server deep links (Jellyfin/Plex) | ❌ | ✅ |
| Auto-discover Plex server | ❌ | ✅ |
| Episode list with availability | ❌ | ✅ |
| Torrent flatten (subfolder fix) | ❌ | ✅ |

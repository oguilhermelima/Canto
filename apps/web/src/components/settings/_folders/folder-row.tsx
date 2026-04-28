"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Switch } from "@canto/ui/switch";
import { trpc } from "@/lib/trpc/client";
import type { QbitPathOption } from "./folder-qbit-path";
import type { RoutingRules } from "./folder-routing-rules-ui";
import { AnimatedCollapse } from "./folder-animated-collapse";
import { PathInput } from "./folder-path-input";
import { QbitPathSelect } from "./folder-qbit-path";
import { FolderRulesPreview } from "./folder-rules-preview";
import { RulesEditorDialog } from "./folder-rules-editor";
import { cardInputCn } from "./folder-routing-rules-ui";

export interface FolderData {
  id: string;
  name: string;
  downloadPath: string | null;
  libraryPath: string | null;
  qbitCategory: string | null;
  rules: RoutingRules | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  downloadProfileId: string | null;
}

interface DownloadProfileOption {
  id: string;
  name: string;
  flavor: string;
  isDefault: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Per-folder row                                                             */
/* -------------------------------------------------------------------------- */

interface FolderCardProps {
  folder: FolderData;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  importMethod?: "local" | "remote";
  /** qBittorrent category options for the path dropdown (remote mode only) */
  qbitOptions?: QbitPathOption[];
}

export function FolderCard({
  folder,
  expanded,
  onToggle,
  onRefresh,
  importMethod = "local",
  qbitOptions,
}: FolderCardProps): React.JSX.Element {
  const isLocal = importMethod === "local";
  const form = useFolderRowForm(folder, onRefresh);
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: downloadProfiles } = trpc.downloadProfile.list.useQuery();

  const needsConfig = !folder.downloadPath || !folder.libraryPath;

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border transition-colors overflow-hidden",
          needsConfig
            ? "border-amber-500/30 bg-amber-500/[0.02]"
            : "border-border",
        )}
      >
        <FolderRowHeader
          folder={folder}
          expanded={expanded}
          name={form.name}
          onNameChange={form.setName}
          needsConfig={needsConfig}
          onToggle={onToggle}
        />

        <AnimatedCollapse open={expanded}>
          <div className="border-t border-border px-4 sm:px-5 py-5">
            <FolderDownloadSection
              dlPath={form.dlPath}
              onDlPathChange={form.setDlPath}
              qbitCat={form.qbitCat}
              onQbitCatChange={form.setQbitCat}
              downloadProfileId={form.downloadProfileId}
              onDownloadProfileIdChange={form.setDownloadProfileId}
              editingDlPath={form.editingDlPath}
              onEditDlPath={() => form.setEditingDlPath(true)}
              isLocal={isLocal}
              qbitOptions={qbitOptions}
              downloadProfiles={downloadProfiles ?? []}
            />
            <FolderStorageSection
              libPath={form.libPath}
              onLibPathChange={form.setLibPath}
              editingLibPath={form.editingLibPath}
              onEditLibPath={() => form.setEditingLibPath(true)}
              isLocal={isLocal}
              qbitOptions={qbitOptions}
            />
            <FolderRoutingSection
              folder={folder}
              onEditRules={() => setRulesOpen(true)}
            />
            <FolderFallbackSection
              folder={folder}
              setDefault={form.setDefault}
            />
            <FolderRowActions
              dirty={form.dirty}
              onSave={form.handleSave}
              onDelete={() => form.deleteFolder.mutate({ id: folder.id })}
              isSaving={form.updateFolder.isPending}
              isDeleting={form.deleteFolder.isPending}
            />
          </div>
        </AnimatedCollapse>
      </div>

      <RulesEditorDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={folder.rules}
        onSave={form.handleSaveRules}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form state hook                                                            */
/* -------------------------------------------------------------------------- */

function useFolderRowForm(folder: FolderData, onRefresh: () => void) {
  const [name, setName] = useState(folder.name);
  const [dlPath, setDlPath] = useState(folder.downloadPath ?? "");
  const [libPath, setLibPath] = useState(folder.libraryPath ?? "");
  const [qbitCat, setQbitCat] = useState(folder.qbitCategory ?? "");
  const [downloadProfileId, setDownloadProfileId] = useState<string | null>(
    folder.downloadProfileId ?? null,
  );
  const [editingDlPath, setEditingDlPath] = useState(!!folder.downloadPath);
  const [editingLibPath, setEditingLibPath] = useState(!!folder.libraryPath);

  const dirty =
    name !== folder.name ||
    dlPath !== (folder.downloadPath ?? "") ||
    libPath !== (folder.libraryPath ?? "") ||
    qbitCat !== (folder.qbitCategory ?? "") ||
    downloadProfileId !== (folder.downloadProfileId ?? null);

  // Sync state from server, but skip when user has unsaved edits
  const prevFolderId = useRef(folder.id);
  useEffect(() => {
    const isNewFolder = folder.id !== prevFolderId.current;
    prevFolderId.current = folder.id;
    if (isNewFolder || !dirty) {
      setName(folder.name);
      setDlPath(folder.downloadPath ?? "");
      setLibPath(folder.libraryPath ?? "");
      setQbitCat(folder.qbitCategory ?? "");
      setDownloadProfileId(folder.downloadProfileId ?? null);
      setEditingDlPath(!!folder.downloadPath);
      setEditingLibPath(!!folder.libraryPath);
    }
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFolder = trpc.folder.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteFolder = trpc.folder.delete.useMutation({
    onSuccess: () => {
      toast.success("Library deleted");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });
  const setDefault = trpc.folder.setDefault.useMutation({
    onSuccess: () => {
      toast.success("Fallback updated");
      onRefresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (): void => {
    updateFolder.mutate({
      id: folder.id,
      name,
      downloadPath: dlPath || null,
      libraryPath: libPath || null,
      qbitCategory: qbitCat || null,
      downloadProfileId,
    });
  };

  const handleSaveRules = (rules: RoutingRules | null): void => {
    updateFolder.mutate({ id: folder.id, rules });
  };

  return {
    name,
    setName,
    dlPath,
    setDlPath,
    libPath,
    setLibPath,
    qbitCat,
    setQbitCat,
    downloadProfileId,
    setDownloadProfileId,
    editingDlPath,
    setEditingDlPath,
    editingLibPath,
    setEditingLibPath,
    dirty,
    updateFolder,
    deleteFolder,
    setDefault,
    handleSave,
    handleSaveRules,
  };
}

/* -------------------------------------------------------------------------- */
/*  Layout helpers                                                             */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  icon: Icon,
  iconClass,
  label,
}: {
  icon: typeof Download;
  iconClass: string;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClass)} />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function FieldRow({
  label,
  children,
  width,
}: {
  label: string;
  children: React.ReactNode;
  width?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <label className="text-sm font-medium text-muted-foreground sm:w-28 sm:shrink-0 sm:text-right">
        {label}
      </label>
      <div className={width ?? "flex-1"}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header (collapsed/expanded title row)                                      */
/* -------------------------------------------------------------------------- */

interface FolderRowHeaderProps {
  folder: FolderData;
  expanded: boolean;
  name: string;
  onNameChange: (name: string) => void;
  needsConfig: boolean;
  onToggle: () => void;
}

function FolderRowHeader({
  folder,
  expanded,
  name,
  onNameChange,
  needsConfig,
  onToggle,
}: FolderRowHeaderProps): React.JSX.Element {
  return (
    <div className="flex w-full items-start gap-3 px-4 sm:px-5 py-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-start gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
      >
        <Folder
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            needsConfig ? "text-amber-500/60" : "text-primary",
          )}
        />
        {expanded ? (
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-auto rounded-none border-0 border-b border-border bg-transparent p-0 pb-1 text-base font-semibold text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary caret-primary"
          />
        ) : (
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <p className="text-base font-semibold text-foreground truncate">
              {folder.name}
            </p>
            {needsConfig && (
              <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400 shrink-0">
                Needs paths
              </span>
            )}
            {!folder.enabled && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground shrink-0">
                Disabled
              </span>
            )}
          </div>
        )}
      </button>
      {expanded && (
        <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <button type="button" onClick={onToggle} className="mt-0.5 shrink-0">
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-300",
            expanded && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Download section: download path + qbit category + download profile        */
/* -------------------------------------------------------------------------- */

interface FolderDownloadSectionProps {
  dlPath: string;
  onDlPathChange: (value: string) => void;
  qbitCat: string;
  onQbitCatChange: (value: string) => void;
  downloadProfileId: string | null;
  onDownloadProfileIdChange: (value: string | null) => void;
  editingDlPath: boolean;
  onEditDlPath: () => void;
  isLocal: boolean;
  qbitOptions?: QbitPathOption[];
  downloadProfiles: DownloadProfileOption[];
}

function FolderDownloadSection({
  dlPath,
  onDlPathChange,
  qbitCat,
  onQbitCatChange,
  downloadProfileId,
  onDownloadProfileIdChange,
  editingDlPath,
  onEditDlPath,
  isLocal,
  qbitOptions,
  downloadProfiles,
}: FolderDownloadSectionProps): React.JSX.Element {
  return (
    <>
      <div className="mt-2">
        <SectionTitle
          icon={Download}
          iconClass="text-blue-400"
          label="Download"
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Where your torrent client saves files while downloading and seeding.
      </p>
      <div className="mt-3 space-y-3">
        <FieldRow label="Download path">
          {editingDlPath ? (
            isLocal ? (
              <PathInput
                value={dlPath}
                onChange={onDlPathChange}
                placeholder="/data/downloads/movies"
                className={cardInputCn}
              />
            ) : (
              <QbitPathSelect
                value={dlPath}
                onChange={onDlPathChange}
                onCategoryChange={onQbitCatChange}
                placeholder="Select a qBittorrent path"
                className={cardInputCn}
                options={qbitOptions ?? []}
              />
            )
          ) : (
            <button
              type="button"
              onClick={onEditDlPath}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Set download path
            </button>
          )}
        </FieldRow>
        <FieldRow label="qBit category" width="sm:w-48">
          {isLocal ? (
            <Input
              value={qbitCat}
              onChange={(e) => onQbitCatChange(e.target.value)}
              placeholder="e.g. movies"
              className={cardInputCn}
            />
          ) : (
            <Input
              value={qbitCat}
              readOnly
              placeholder="Auto from path"
              className={cn(
                cardInputCn,
                "bg-muted/20 text-muted-foreground cursor-default",
              )}
              title="Category is derived from the selected qBittorrent path"
            />
          )}
        </FieldRow>
        <FieldRow label="Download profile" width="sm:w-64">
          <Select
            value={downloadProfileId ?? "__none__"}
            onValueChange={(v) =>
              onDownloadProfileIdChange(v === "__none__" ? null : v)
            }
          >
            <SelectTrigger className={cardInputCn}>
              <SelectValue placeholder="Use system default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Use system default</SelectItem>
              {downloadProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.flavor}
                  {p.isDefault ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Storage section                                                            */
/* -------------------------------------------------------------------------- */

interface FolderStorageSectionProps {
  libPath: string;
  onLibPathChange: (value: string) => void;
  editingLibPath: boolean;
  onEditLibPath: () => void;
  isLocal: boolean;
  qbitOptions?: QbitPathOption[];
}

function FolderStorageSection({
  libPath,
  onLibPathChange,
  editingLibPath,
  onEditLibPath,
  isLocal,
  qbitOptions,
}: FolderStorageSectionProps): React.JSX.Element {
  return (
    <>
      <div className="mt-8">
        <SectionTitle
          icon={FolderOpen}
          iconClass="text-emerald-400"
          label="Storage"
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {isLocal
          ? "After importing, Canto moves files here and renames them so media servers like Jellyfin and Plex can recognize them. Point your media server to this path."
          : "After downloading, qBittorrent moves files here and Canto renames them so media servers like Jellyfin and Plex can recognize them. Point your media server to this path."}
      </p>
      <div className="mt-3">
        <FieldRow label="Storage path">
          {editingLibPath ? (
            isLocal ? (
              <PathInput
                value={libPath}
                onChange={onLibPathChange}
                placeholder="/data/media/movies"
                className={cardInputCn}
              />
            ) : (
              <QbitPathSelect
                value={libPath}
                onChange={onLibPathChange}
                placeholder="Select a qBittorrent path"
                className={cardInputCn}
                options={qbitOptions ?? []}
                showCategoryHint={false}
              />
            )
          ) : (
            <button
              type="button"
              onClick={onEditLibPath}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Set storage path
            </button>
          )}
        </FieldRow>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Routing section                                                            */
/* -------------------------------------------------------------------------- */

interface FolderRoutingSectionProps {
  folder: FolderData;
  onEditRules: () => void;
}

function FolderRoutingSection({
  folder,
  onEditRules,
}: FolderRoutingSectionProps): React.JSX.Element {
  return (
    <>
      <div className="mt-8">
        <SectionTitle icon={Wand2} iconClass="text-primary" label="Routing" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Automatically assign downloads to this library based on media metadata.
      </p>
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Rules</p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl text-xs"
            onClick={onEditRules}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit rules
          </Button>
        </div>
        {folder.rules ? (
          <div className="mt-3">
            <FolderRulesPreview rules={folder.rules} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground italic">
            No rules — this library will only be used when manually selected.
          </p>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fallback section                                                           */
/* -------------------------------------------------------------------------- */

interface FolderFallbackSectionProps {
  folder: FolderData;
  setDefault: ReturnType<typeof trpc.folder.setDefault.useMutation>;
}

function FolderFallbackSection({
  folder,
  setDefault,
}: FolderFallbackSectionProps): React.JSX.Element {
  return (
    <>
      <div className="mt-8">
        <SectionTitle
          icon={ShieldCheck}
          iconClass="text-amber-400"
          label="Fallback"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Use this library when no routing rules match a download.
        </p>
        <Switch
          checked={folder.isDefault}
          onCheckedChange={(checked) => {
            if (checked) setDefault.mutate({ id: folder.id });
          }}
          disabled={folder.isDefault || setDefault.isPending}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Actions row                                                                */
/* -------------------------------------------------------------------------- */

interface FolderRowActionsProps {
  dirty: boolean;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function FolderRowActions({
  dirty,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: FolderRowActionsProps): React.JSX.Element {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="text-sm text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete library
      </button>
      {dirty && (
        <Button
          size="sm"
          className="rounded-xl gap-2"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save changes
        </Button>
      )}
    </div>
  );
}

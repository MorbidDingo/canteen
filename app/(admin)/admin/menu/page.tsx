"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  type MenuCategory,
} from "@/lib/constants";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  UtensilsCrossed,
  ImagePlus,
  X,
  Loader2,
  Video,
  Power,
  PowerOff,
  Search,
  Package,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { emitEvent, useRealtimeData } from "@/lib/events";
import { CanteenSelector } from "@/components/canteen-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

interface MenuItem {
  id: string;
  canteenId: string | null;
  canteenName?: string | null;
  canteenLocation?: string | null;
  name: string;
  description: string | null;
  price: number;
  category: string;
  imageUrl: string | null;
  videoUrl: string | null;
  additionalImages: string | null;
  available: boolean;
  availableUnits: number | null;
  subscribable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CanteenEntity {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface FormData {
  canteenId: string | null;
  name: string;
  description: string;
  price: string;
  category: MenuCategory;
  imageUrl: string;
  videoUrl: string;
  additionalImages: string[];
  available: boolean;
  availableUnits: string;
  subscribable: boolean;
}

const emptyForm: FormData = {
  canteenId: null,
  name: "",
  description: "",
  price: "",
  category: "SNACKS",
  imageUrl: "",
  videoUrl: "",
  additionalImages: [],
  available: true,
  availableUnits: "0",
  subscribable: true,
};

const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

function pickRecorderMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "video/webm";
}

async function loadVideoElementFromFile(file: File) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const objectUrl = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to read selected video."));
    video.src = objectUrl;
  });

  return { video, objectUrl };
}

async function transcodeVideoAttempt(file: File, bitrate: number, scale: number): Promise<File> {
  const { video, objectUrl } = await loadVideoElementFromFile(file);

  try {
    const capture = HTMLCanvasElement.prototype.captureStream as
      | ((this: HTMLCanvasElement, frameRate?: number) => MediaStream)
      | undefined;
    if (!capture) {
      throw new Error("Video compression is not supported in this browser.");
    }

    const width = Math.max(320, Math.floor(video.videoWidth * scale));
    const height = Math.max(240, Math.floor(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to initialize video compressor.");

    const canvasStream = capture.call(canvas, 24);
    const inputStream = (video as unknown as { captureStream?: () => MediaStream }).captureStream?.();
    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(inputStream?.getAudioTracks() ?? []),
    ]);

    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(mixedStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Video compression failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    let raf = 0;
    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, width, height);
      raf = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await video.play();
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(raf);
    recorder.stop();
    const blob = await done;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-compressed.webm`, {
      type: blob.type || "video/webm",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressVideoBelow20MB(
  file: File,
  onStep?: (text: string) => void,
): Promise<File> {
  if (file.size <= MAX_VIDEO_SIZE_BYTES) return file;

  const attempts: Array<{ bitrate: number; scale: number; label: string }> = [
    { bitrate: 1_400_000, scale: 1, label: "Compressing video (pass 1/5)" },
    { bitrate: 1_000_000, scale: 0.9, label: "Compressing video (pass 2/5)" },
    { bitrate: 800_000, scale: 0.82, label: "Compressing video (pass 3/5)" },
    { bitrate: 620_000, scale: 0.74, label: "Compressing video (pass 4/5)" },
    { bitrate: 450_000, scale: 0.66, label: "Compressing video (pass 5/5)" },
  ];

  let candidate: File = file;
  for (const attempt of attempts) {
    onStep?.(attempt.label);
    try {
      candidate = await transcodeVideoAttempt(candidate, attempt.bitrate, attempt.scale);
      if (candidate.size <= MAX_VIDEO_SIZE_BYTES) {
        return candidate;
      }
    } catch {
      // Try the next settings profile.
    }
  }

  throw new Error("Could not compress video below 20MB. Try trimming the video and upload again.");
}

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [canteens, setCanteens] = useState<CanteenEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [canteensLoading, setCanteensLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingCanteenId, setTogglingCanteenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    value: selectedCanteen,
    setValue: setSelectedCanteen,
    hydrated: canteenScopeHydrated,
  } = usePersistedSelection("certe:admin-selected-canteen-id");

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const query = selectedCanteen
        ? `?canteenId=${encodeURIComponent(selectedCanteen)}`
        : "";
      const res = await fetch(`/api/admin/menu${query}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
    } catch {
      toast.error("Failed to fetch menu items");
    } finally {
      setLoading(false);
    }
  }, [selectedCanteen]);

  const fetchCanteens = useCallback(async () => {
    try {
      setCanteensLoading(true);
      const res = await fetch("/api/org/canteens", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch canteens");
      const data = (await res.json()) as { canteens: CanteenEntity[] };
      setCanteens(data.canteens ?? []);
    } catch {
      toast.error("Failed to load canteens");
    } finally {
      setCanteensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canteenScopeHydrated) return;
    void fetchItems();
    void fetchCanteens();
  }, [fetchItems, fetchCanteens, canteenScopeHydrated]);

  // Instant refresh via SSE when any menu event occurs
  useRealtimeData(fetchItems, "menu-updated");

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ ...emptyForm, canteenId: selectedCanteen });
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    let parsedImages: string[] = [];
    if (item.additionalImages) {
      try { parsedImages = JSON.parse(item.additionalImages) as string[]; } catch { /* invalid JSON — fallback to empty */ }
    }
    setFormData({
      canteenId: item.canteenId,
      name: item.name,
      description: item.description || "",
      price: item.price.toString(),
      category: item.category as MenuCategory,
      imageUrl: item.imageUrl || "",
      videoUrl: item.videoUrl || "",
      additionalImages: parsedImages,
      available: item.available,
      availableUnits: item.availableUnits !== null ? item.availableUnits.toString() : "",
      subscribable: item.subscribable,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Price must be a positive number");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        canteenId: formData.canteenId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price,
        category: formData.category,
        imageUrl: formData.imageUrl.trim() || "",
        videoUrl: formData.videoUrl.trim() || "",
        additionalImages: formData.additionalImages.length > 0
          ? JSON.stringify(formData.additionalImages)
          : "",
        available: formData.available,
        availableUnits: formData.availableUnits.trim() !== ""
          ? parseInt(formData.availableUnits)
          : 0,
        subscribable: formData.subscribable,
      };

      let res: Response;
      if (editingItem) {
        res = await fetch(`/api/admin/menu/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success(editingItem ? "Item updated" : "Item created");
      setDialogOpen(false);
      fetchItems();
      emitEvent("menu-updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/menu/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Item deleted");
      fetchItems();
      emitEvent("menu-updated");
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setDeleting(null);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await fetch(`/api/admin/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: !item.available }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(
        item.available ? "Item marked unavailable" : "Item marked available",
      );
      fetchItems();
      emitEvent("menu-updated");
    } catch {
      toast.error("Failed to toggle availability");
    }
  };

  const toggleCanteenStatus = async (canteen: CanteenEntity) => {
    setTogglingCanteenId(canteen.id);
    try {
      const nextStatus = canteen.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await fetch("/api/org/canteens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: canteen.id, status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update canteen");
      }
      toast.success(nextStatus === "ACTIVE" ? "Canteen opened" : "Canteen closed");
      await Promise.all([fetchCanteens(), fetchItems()]);
      emitEvent("menu-updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update canteen");
    } finally {
      setTogglingCanteenId(null);
    }
  };

  const categorized = Object.values(MENU_CATEGORIES).map((cat) => ({
    category: cat,
    label: MENU_CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  }));

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-2xl">
      <div className="mb-6 animate-fade-in space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">Menu Management</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Add, edit, and manage menu items
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={fetchItems}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 h-9" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden xs:inline">Add Item</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-lg md:max-w-xl max-h-[92svh] overflow-hidden p-0">
                <MenuItemForm
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  saving={saving}
                  isEdit={!!editingItem}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <CanteenSelector
          value={selectedCanteen}
          onChange={setSelectedCanteen}
          showAll
          compact
          includeInactive
        />

        <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Canteen serving control
          </p>
          {canteensLoading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading canteens...
            </div>
          ) : canteens.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No canteens assigned to your account.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {canteens.map((canteen) => {
                const isOpen = canteen.status === "ACTIVE";
                return (
                  <div key={canteen.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{canteen.name}</span>
                      <Badge variant={isOpen ? "default" : "secondary"} className="text-[10px]">
                        {isOpen ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isOpen ? "destructive" : "default"}
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={togglingCanteenId === canteen.id}
                      onClick={() => void toggleCanteenStatus(canteen)}
                    >
                      {togglingCanteenId === canteen.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isOpen ? (
                        <PowerOff className="h-3 w-3" />
                      ) : (
                        <Power className="h-3 w-3" />
                      )}
                      {isOpen ? "Close" : "Open"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UtensilsCrossed className="h-12 w-12 mb-2 opacity-40" />
            <p>No menu items yet</p>
            <Button variant="link" className="mt-2" onClick={openCreate}>
              Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categorized
            .filter((c) => c.items.length > 0)
            .map(({ category, label, items: catItems }) => (
              <div key={category}>
                <h2 className="text-lg font-semibold mb-3">{label}</h2>
                <div className="space-y-2">
                  {catItems.map((item, index) => (
                    <Card
                      key={item.id}
                      className={`animate-fade-in-up ${!item.available ? "opacity-60" : ""}`}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <CardContent className="p-3 space-y-2">
                        {/* Top row: thumbnail + name + price */}
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-14 sm:h-12 sm:w-12 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={item.name}
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UtensilsCrossed className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium truncate text-sm sm:text-base">
                                {item.name}
                              </span>
                              <span className="font-bold whitespace-nowrap text-sm">
                                ₹{item.price.toFixed(2)}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {!item.available && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Unavailable
                                </Badge>
                              )}
                              {item.availableUnits !== null && (
                                <Badge
                                  variant={item.availableUnits === 0 ? "destructive" : "outline"}
                                  className="text-[10px]"
                                >
                                  {item.availableUnits === 0
                                    ? "Sold Out"
                                    : `${item.availableUnits} left`}
                                </Badge>
                              )}
                              {item.availableUnits === null && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  ∞
                                </Badge>
                              )}
                              {item.canteenName && (
                                <Badge variant="outline" className="text-[10px]">
                                  {item.canteenName}
                                  {item.canteenLocation ? ` · ${item.canteenLocation}` : ""}
                                </Badge>
                              )}
                              {!item.subscribable && (
                                <Badge variant="outline" className="text-[10px] text-orange-600">
                                  No Sub
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Bottom row: action buttons */}
                        <div className="flex items-center justify-end gap-1 border-t pt-2 -mb-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => toggleAvailability(item)}
                          >
                            {item.available ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline">
                              {item.available ? "Hide" : "Show"}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                            disabled={deleting === item.id}
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function MenuItemForm({
  formData,
  setFormData,
  onSave,
  saving,
  isEdit,
}: {
  formData: FormData;
  setFormData: (data: FormData) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const additionalImageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [additionalImageUploading, setAdditionalImageUploading] = useState(false);
  const [videoUploadStage, setVideoUploadStage] = useState<string>("");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new globalThis.FormData();
      form.append("file", file);
      form.append("kind", "image");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();
      setFormData({ ...formData, imageUrl });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload image",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = () => {
    setFormData({ ...formData, imageUrl: "" });
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file.");
      return;
    }

    setVideoUploading(true);
    setVideoUploadStage("Preparing video...");
    try {
      const compressed = await compressVideoBelow20MB(file, setVideoUploadStage);
      const form = new globalThis.FormData();
      form.append("file", compressed);
      form.append("kind", "video");
      setVideoUploadStage("Uploading compressed video...");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { assetUrl, imageUrl } = await res.json();
      setFormData({ ...formData, videoUrl: (assetUrl as string) || (imageUrl as string) });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload video",
      );
    } finally {
      setVideoUploadStage("");
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleAdditionalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAdditionalImageUploading(true);
    try {
      const form = new globalThis.FormData();
      form.append("file", file);
      form.append("kind", "image");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();
      setFormData({
        ...formData,
        additionalImages: [...formData.additionalImages, imageUrl],
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload image",
      );
    } finally {
      setAdditionalImageUploading(false);
      if (additionalImageInputRef.current) additionalImageInputRef.current.value = "";
    }
  };

  const removeAdditionalImage = (index: number) => {
    setFormData({
      ...formData,
      additionalImages: formData.additionalImages.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="flex max-h-[82svh] flex-col">
      <div className="space-y-4 overflow-y-auto px-4 pb-4 pt-2 sm:px-6">
      {/* Image Upload */}
      <div className="space-y-2">
        <Label>Food Photo</Label>
        {formData.imageUrl ? (
          <div className="relative w-full h-40 rounded-lg overflow-hidden border bg-muted">
            <Image
              src={formData.imageUrl}
              alt="Preview"
              fill
              className="object-cover"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm">Uploading...</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-8 w-8" />
                <span className="text-sm">Click to upload photo</span>
                <span className="text-xs">JPEG, PNG, WebP, GIF — max 20MB</span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>

      {/* Video Upload */}
      <div className="space-y-2">
        <Label>Video (optional)</Label>
        {formData.videoUrl ? (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 whitespace-normal break-all text-sm leading-tight">
              {formData.videoUrl.split("/").pop()}
            </span>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, videoUrl: "" })}
              className="shrink-0 rounded-full p-1 hover:bg-muted transition"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={videoUploading}
            className="w-full h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            {videoUploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs">{videoUploadStage || "Uploading video..."}</span>
              </>
            ) : (
              <>
                <Video className="h-5 w-5" />
                <span className="text-xs">Upload a video for this item (auto-compressed to under 20MB)</span>
              </>
            )}
          </button>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg"
          className="hidden"
          onChange={handleVideoUpload}
        />
      </div>

      {/* Additional Images */}
      <div className="space-y-2">
        <Label>Additional Images (optional)</Label>
        {formData.additionalImages.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {formData.additionalImages.map((url, idx) => (
              <div key={url} className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
                <Image src={url} alt={`Additional ${idx + 1}`} fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => removeAdditionalImage(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => additionalImageInputRef.current?.click()}
          disabled={additionalImageUploading}
          className="w-full h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
        >
          {additionalImageUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Uploading...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4" />
              <span className="text-xs">Add image</span>
            </>
          )}
        </button>
        <input
          ref={additionalImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleAdditionalImageUpload}
        />
      </div>

      <div className="space-y-2">
        <Label>Canteen</Label>
        <CanteenSelector
          value={formData.canteenId}
          onChange={(canteenId) => setFormData({ ...formData, canteenId })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. Samosa"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Optional description"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price (₹) *</Label>
          <Input
            id="price"
            type="number"
            step="0.5"
            min="0"
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: e.target.value })
            }
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select
            value={formData.category}
            onValueChange={(v) =>
              setFormData({ ...formData, category: v as MenuCategory })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MENU_CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="availableUnits">Available Units</Label>
        <Input
          id="availableUnits"
          type="number"
          min="0"
          value={formData.availableUnits}
          onChange={(e) =>
            setFormData({ ...formData, availableUnits: e.target.value })
          }
          placeholder="Leave empty for unlimited"
        />
        <p className="text-xs text-muted-foreground">
          Empty = unlimited supply. Set a number to track and auto-decrement on orders.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="available"
          checked={formData.available}
          onChange={(e) =>
            setFormData({ ...formData, available: e.target.checked })
          }
          className="rounded border-gray-300"
        />
        <Label htmlFor="available" className="font-normal">
          Available for ordering
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="subscribable"
          checked={formData.subscribable}
          onChange={(e) =>
            setFormData({ ...formData, subscribable: e.target.checked })
          }
          className="rounded border-gray-300"
        />
        <Label htmlFor="subscribable" className="font-normal">
          Available for subscriptions
        </Label>
      </div>

      </div>

      <div className="border-t bg-background px-4 py-3 sm:px-6">
        <Button
          className="w-full"
          onClick={onSave}
          disabled={saving || uploading || videoUploading || additionalImageUploading}
        >
          {saving ? "Saving..." : isEdit ? "Update Item" : "Create Item"}
        </Button>
      </div>
    </div>
  );
}

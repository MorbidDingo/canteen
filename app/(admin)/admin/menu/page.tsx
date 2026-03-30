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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
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

  useEffect(() => {
    if (!canteenScopeHydrated) return;
    fetchItems();
  }, [fetchItems, canteenScopeHydrated]);

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
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? "Edit Menu Item" : "Add Menu Item"}
                  </DialogTitle>
                </DialogHeader>
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
        />
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new globalThis.FormData();
      form.append("file", file);

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

    setVideoUploading(true);
    try {
      const form = new globalThis.FormData();
      form.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { imageUrl } = await res.json();
      setFormData({ ...formData, videoUrl: imageUrl });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload video",
      );
    } finally {
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
    <div className="space-y-4">
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
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm truncate flex-1">{formData.videoUrl.split("/").pop()}</span>
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
                <span className="text-xs">Uploading video...</span>
              </>
            ) : (
              <>
                <Video className="h-5 w-5" />
                <span className="text-xs">Upload a video for this item</span>
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

      <Button
        className="w-full"
        onClick={onSave}
        disabled={saving || uploading}
      >
        {saving ? "Saving..." : isEdit ? "Update Item" : "Create Item"}
      </Button>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  GraduationCap,
  Search,
  Plus,
  Trash2,
  User,
  CreditCard,
  Loader2,
  RefreshCw,
  Camera,
  ImageIcon,
} from "lucide-react";

interface Student {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  image: string | null;
  parentId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string | null;
  createdAt: string;
}

interface ParentOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export default function ManagementStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formGR, setFormGR] = useState("");
  const [formClass, setFormClass] = useState("");
  const [formSection, setFormSection] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [suggestedParents, setSuggestedParents] = useState<ParentOption[]>([]);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);

  const handlePhotoUpload = async (studentId: string, file: File) => {
    setUploadingPhotoId(studentId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/management/students/${studentId}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload photo");
      }
      const data = await res.json();
      // Update student in list with new image
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, image: data.imageUrl } : s,
        ),
      );
      toast.success("Student photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const fetchStudents = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const url = q && q.length >= 2
        ? `/api/management/students?q=${encodeURIComponent(q)}`
        : "/api/management/students";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStudents(data.students);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length === 0) {
      fetchStudents();
      return;
    }
    if (searchQuery.length < 2) return;
    const timer = setTimeout(() => fetchStudents(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchStudents]);

  // Parent surname search with debounce
  useEffect(() => {
    if (parentSearch.length < 2) {
      setParentOptions([]);
      return;
    }
    setParentLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/management/parents?surname=${encodeURIComponent(parentSearch)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setParentOptions(data.parents);
        }
      } catch {
        // ignore
      } finally {
        setParentLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); setParentLoading(false); };
  }, [parentSearch]);

  // Auto-suggest parents from student last name / middle name
  useEffect(() => {
    if (selectedParent || parentSearch.length >= 2) {
      setSuggestedParents([]);
      return;
    }
    const words = formName.trim().split(/\s+/);
    if (words.length < 2) {
      setSuggestedParents([]);
      return;
    }
    // Search using last name (and middle name if present)
    const searchTerms = words.slice(1).filter((w) => w.length >= 2);
    if (searchTerms.length === 0) {
      setSuggestedParents([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        // Search with each name part and combine unique results
        const allResults: ParentOption[] = [];
        const seenIds = new Set<string>();
        for (const term of searchTerms) {
          const res = await fetch(
            `/api/management/parents?surname=${encodeURIComponent(term)}`,
          );
          if (res.ok) {
            const data = await res.json();
            for (const p of data.parents as ParentOption[]) {
              if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                allResults.push(p);
              }
            }
          }
        }
        setSuggestedParents(allResults);
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formName, selectedParent, parentSearch]);

  const resetForm = () => {
    setFormName("");
    setFormGR("");
    setFormClass("");
    setFormSection("");
    setParentSearch("");
    setParentOptions([]);
    setSelectedParent(null);
    setSuggestedParents([]);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error("Student name is required");
      return;
    }
    if (!selectedParent) {
      toast.error("Please select a parent");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/management/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          grNumber: formGR.trim() || undefined,
          className: formClass.trim() || undefined,
          section: formSection.trim() || undefined,
          parentId: selectedParent.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create student");
      }
      toast.success("Student created");
      setDialogOpen(false);
      resetForm();
      fetchStudents(searchQuery || undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Delete "${student.name}"? This will also delete their wallet, orders, and all related data. This cannot be undone.`)) return;
    setDeleting(student.id);
    try {
      const res = await fetch(`/api/management/students/${student.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Student deleted");
      fetchStudents(searchQuery || undefined);
    } catch {
      toast.error("Failed to delete student");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Students
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage student records and parent assignments
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchStudents(searchQuery || undefined)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Student</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="studentName">Student Name *</Label>
                  <Input
                    id="studentName"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="grNumber">GR No.</Label>
                    <Input
                      id="grNumber"
                      value={formGR}
                      onChange={(e) => setFormGR(e.target.value)}
                      placeholder="GR123"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="className">Class</Label>
                    <Input
                      id="className"
                      value={formClass}
                      onChange={(e) => setFormClass(e.target.value)}
                      placeholder="5th"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section">Section</Label>
                    <Input
                      id="section"
                      value={formSection}
                      onChange={(e) => setFormSection(e.target.value)}
                      placeholder="A"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Parent *</Label>
                  {selectedParent ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedParent.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{selectedParent.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSelectedParent(null); setParentSearch(""); setParentOptions([]); }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {suggestedParents.length > 0 && !parentSearch && (
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground mb-1">Suggested parents (matching student name)</p>
                          <div className="border rounded-md max-h-32 overflow-y-auto bg-primary/5">
                            {suggestedParents.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors text-sm"
                                onClick={() => { setSelectedParent(p); setParentOptions([]); setSuggestedParents([]); }}
                              >
                                <p className="font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={parentSearch}
                          onChange={(e) => setParentSearch(e.target.value)}
                          placeholder="Search parent by name..."
                          className="pl-9"
                        />
                        {parentLoading && (
                          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {parentOptions.length > 0 && (
                        <div className="border rounded-md max-h-40 overflow-y-auto">
                          {parentOptions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm"
                              onClick={() => { setSelectedParent(p); setParentOptions([]); }}
                            >
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Button className="w-full" onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating..." : "Create Student"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, GR number, or parent name..."
          className="pl-10"
        />
      </div>

      {/* Student list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <GraduationCap className="h-12 w-12 mb-2 opacity-40" />
            <p>{searchQuery ? "No students found" : "No students yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {students.map((student, index) => (
            <Card
              key={student.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <CardContent className="flex items-center gap-3 py-3 px-4">
                {/* Student avatar / photo */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative group">
                  {student.image ? (
                    <Image
                      src={student.image}
                      alt={student.name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full rounded-full"
                    />
                  ) : (
                    <GraduationCap className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{student.name}</span>
                    {student.grNumber && (
                      <Badge variant="outline" className="text-[10px]">
                        GR: {student.grNumber}
                      </Badge>
                    )}
                    {student.rfidCardId && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <CreditCard className="h-2.5 w-2.5" />
                        Card
                      </Badge>
                    )}
                    {!student.image && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-orange-600 border-orange-300">
                        <ImageIcon className="h-2.5 w-2.5" />
                        No Photo
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {(student.className || student.section) && (
                      <span>
                        {[student.className, student.section].filter(Boolean).join(" - ")}
                      </span>
                    )}
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {student.parentName}
                    </span>
                  </div>
                </div>
                {/* Photo upload button */}
                <label
                  className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted cursor-pointer shrink-0 transition-colors"
                  title="Upload student photo"
                >
                  {uploadingPhotoId === student.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Camera className="h-4 w-4 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingPhotoId === student.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(student.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  disabled={deleting === student.id}
                  onClick={() => handleDelete(student)}
                >
                  {deleting === student.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

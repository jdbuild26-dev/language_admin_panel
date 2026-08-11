import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import api from "../services/api";
import StoryEditor from "./StoryEditor";

type StoryType = "dialogue" | "monologue";

interface Category {
  id: number;
  name_en: string;
  name_fr?: string;
  name_de?: string;
  name_es?: string;
  learning_lang?: string | null;
  level_code: string;
  story_type: StoryType | null;
  subtopics_count: number;
}

interface StoryItem {
  id: number;
  name_en: string;
  notes_count: number;
  concept_id: string | null;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export default function StoriesManager() {
  const [level, setLevel] = useState("A1");
  const [storyType, setStoryType] = useState<StoryType>("dialogue");
  const [selected, setSelected] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [names, setNames] = useState({ fr: "", de: "", es: "" });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "category" | "story"; item: Category | StoryItem } | null
  >(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin/stories/topics", {
        params: { level_code: level, story_type: storyType },
      });
      setCategories(response.data.topics || []);
    } catch (error: any) {
      setCategories([]);
      setMessage({ ok: false, text: error.response?.data?.detail || "Could not load categories" });
    } finally {
      setLoading(false);
    }
  }, [level, storyType]);

  const loadStories = useCallback(async (categoryId: number) => {
    const response = await api.get("/admin/stories/subtopics", {
      params: { topic_id: categoryId, story_type: storyType },
    });
    setStories(response.data.subtopics || []);
  }, [storyType]);

  useEffect(() => {
    setSelected(null);
    setStories([]);
    loadCategories();
  }, [loadCategories]);

  const createCategory = async () => {
    if (!nameEn.trim()) return;
    setSaving(true);
    try {
      await api.post("/admin/stories/topics", {
        name_en: nameEn.trim(),
        name_fr: names.fr.trim() || undefined,
        name_de: names.de.trim() || undefined,
        name_es: names.es.trim() || undefined,
        level_code: level,
        story_type: storyType,
        order_index: categories.length,
      });
      setNameEn("");
      setNames({ fr: "", de: "", es: "" });
      setShowCreate(false);
      setMessage({ ok: true, text: "Category created" });
      await loadCategories();
    } catch (error: any) {
      setMessage({ ok: false, text: error.response?.data?.detail || "Create failed" });
    } finally {
      setSaving(false);
    }
  };

  const openCategory = async (category: Category) => {
    setSelected(category);
    setMessage(null);
    try {
      await loadStories(category.id);
    } catch {
      setStories([]);
      setMessage({ ok: false, text: "Could not load stories" });
    }
  };

  const deleteCategory = async (category: Category) => {
    setConfirmDelete({ kind: "category", item: category });
  };

  const deleteStory = async (story: StoryItem) => {
    setConfirmDelete({ kind: "story", item: story });
  };

  const confirmDeletion = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      if (confirmDelete.kind === "category") {
        const category = confirmDelete.item as Category;
        await api.delete("/admin/stories/topics/" + category.id);
        await loadCategories();
        setToast({ ok: true, text: "Category deleted" });
      } else {
        const story = confirmDelete.item as StoryItem;
        if (!selected || !story.concept_id) return;
        await api.delete("/admin/story-flow/" + story.concept_id);
        await loadStories(selected.id);
        await loadCategories();
        setToast({ ok: true, text: "Story deleted" });
      }
    } catch (error: any) {
      setToast({ ok: false, text: error.response?.data?.detail || "Delete failed" });
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  };

  const upload = async () => {
    if (!selected) return;
    const type = selected.story_type || storyType;
    const quiz = files.quiz;
    const contentReady = type === "dialogue"
      ? files.part1 && files.part2
      : files.content;
    if (!quiz || !contentReady) {
      setMessage({ ok: false, text: "Select all required CSV files" });
      return;
    }
    const form = new FormData();
    form.append("story_type", type);
    form.append("level", selected.level_code);
    form.append("category_id", String(selected.id));
    form.append("csv_quiz", quiz);
    if (type === "dialogue") {
      form.append("csv_part1", files.part1!);
      form.append("csv_part2", files.part2!);
    } else {
      form.append("csv_content", files.content!);
    }
    setSaving(true);
    try {
      const response = await api.post("/admin/story-flow/upload", form);
      setFiles({});
      await loadStories(selected.id);
      await loadCategories();
      setMessage({ ok: true, text: "Uploaded " + response.data.count + " story(s)" });
    } catch (error: any) {
      setMessage({ ok: false, text: error.response?.data?.detail || "Upload failed" });
    } finally {
      setSaving(false);
    }
  };

  const backToCategories = () => {
    setSelected(null);
    setEditingStoryId(null);
    setFiles({});
    setMessage(null);
  };

  if (selected) {
    if (editingStoryId) {
      return (
        <StoryEditor
          exerciseId={editingStoryId}
          onClose={() => setEditingStoryId(null)}
          onSaved={async () => {
            setEditingStoryId(null);
            await loadStories(selected.id);
          }}
          showToast={(ok, text) => setMessage({ ok, text })}
        />
      );
    }

    const type = selected.story_type || storyType;
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Breadcrumb category={selected.name_en} onBack={backToCategories} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{selected.name_en}</h1>
            <p className="text-muted">{type === "dialogue" ? "Dialogue" : "Monologue"} · {selected.level_code}</p>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
          <h2 style={{ marginBottom: 6 }}>CSV Upload</h2>
          <p className="text-muted" style={{ marginBottom: "1.25rem" }}>Upload content into this category. The story type is already fixed.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: "1 1 580px" }}>
              {type === "dialogue" ? (
                <>
                  <FilePicker label="Content Part 1 CSV" file={files.part1} onFile={(file) => setFiles((v) => ({ ...v, part1: file }))} />
                  <FilePicker label="Content Part 2 CSV" file={files.part2} onFile={(file) => setFiles((v) => ({ ...v, part2: file }))} />
                </>
              ) : (
                <FilePicker label="Content CSV" file={files.content} onFile={(file) => setFiles((v) => ({ ...v, content: file }))} />
              )}
              <FilePicker label="Quiz CSV" file={files.quiz} onFile={(file) => setFiles((v) => ({ ...v, quiz: file }))} />
            </div>
            <div style={{ width: 220, padding: "1rem", borderRadius: 10, background: "rgba(31,111,235,0.08)", border: "1px solid rgba(31,111,235,0.2)", color: "var(--text-muted)", fontSize: 13 }}>
              <strong style={{ color: "var(--text)" }}>Upload checklist</strong>
              <p style={{ marginTop: 8 }}>Use the existing story CSV format. You can upload multiple stories in one batch.</p>
              <button className="btn btn-primary" onClick={upload} disabled={saving} style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
                {saving ? <Loader2 size={15} /> : <Upload size={15} />} Upload CSV
              </button>
            </div>
          </div>
        </div>
        {message && <Message {...message} />}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0 }}>Stories</h2>
          </div>
          {stories.length === 0 ? <p className="text-muted" style={{ padding: "1.5rem" }}>No stories uploaded yet.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}><th style={th}>Sl No</th><th style={th}>Story</th><th style={th}>Content</th><th style={{ ...th, textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>{stories.map((story, index) => (
                <tr key={story.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdMuted}>{index + 1}</td><td style={tdStrong}>{story.name_en}</td><td style={tdMuted}>{story.notes_count}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {story.concept_id && <span style={{ display: "inline-flex", gap: 6 }}>
                      <button title="Edit story" onClick={() => setEditingStoryId(story.concept_id!)} style={iconButtonStyle("#60a5fa")}><Pencil size={14} /></button>
                      <button title="Delete story" onClick={() => deleteStory(story)} style={iconButtonStyle("#ef4444")}><Trash2 size={14} /></button>
                    </span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        {confirmDelete && (
          <ConfirmModal
            kind={confirmDelete.kind}
            name={(confirmDelete.item as Category | StoryItem).name_en}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={confirmDeletion}
            loading={saving}
          />
        )}
        {toast && <Toast {...toast} onDone={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>Stories</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>Manage stories as Level → Type → Category → Story.</p>
      <div className="card" style={{ display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap", padding: "1.25rem 1.5rem" }}>
        <label style={controlLabel}>CEFR Level<select className="form-control" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Type</span>{(["dialogue", "monologue"] as StoryType[]).map((typeItem) => <button key={typeItem} className={storyType === typeItem ? "btn btn-primary" : "btn"} onClick={() => setStoryType(typeItem)}>{typeItem === "dialogue" ? "Dialogue" : "Monologue"}</button>)}</div>
      </div>
      <Breadcrumb />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "1rem 0 1.25rem" }}>
        <h2 style={{ margin: 0 }}>Categories</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> New Category</button>
      </div>
      {showCreate && <div className="card" style={{ padding: "1rem 1.25rem", border: "1px solid var(--accent)", marginBottom: "1.25rem" }}>
        <strong>New Category</strong>
        <div style={{ display: "grid", gap: 8, maxWidth: 560, marginTop: 12 }}>
          <input className="form-control" autoFocus value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Name (EN) e.g. Planning a party *" />
          <input className="form-control" value={names.fr} onChange={(e) => setNames((v) => ({ ...v, fr: e.target.value }))} placeholder="Name (FR) optional" />
          <input className="form-control" value={names.de} onChange={(e) => setNames((v) => ({ ...v, de: e.target.value }))} placeholder="Name (DE) optional" />
          <input className="form-control" value={names.es} onChange={(e) => setNames((v) => ({ ...v, es: e.target.value }))} placeholder="Name (ES) optional" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn btn-primary" onClick={createCategory} disabled={saving || !nameEn.trim()}>Create</button><button className="btn" onClick={() => setShowCreate(false)}>Cancel</button></div>
      </div>}
      {message && <Message {...message} />}
      {loading ? <Loader2 /> : categories.length === 0 ? <div className="card" style={{ textAlign: "center", padding: "3rem" }}><BookOpen size={26} /><p className="text-muted" style={{ marginTop: 8 }}>No categories yet. Click <strong>New Category</strong> to create one.</p></div> : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}><th style={th}>Sl No</th><th style={th}>Category</th><th style={th}>Stories</th><th style={{ ...th, textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>{categories.map((category, index) => <tr key={category.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => openCategory(category)}><td style={tdMuted}>{index + 1}</td><td style={tdStrong}>{category.name_en}{category.name_fr && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>{category.name_fr}</span>}</td><td style={tdMuted}>{category.subtopics_count} stor{category.subtopics_count === 1 ? "y" : "ies"}</td><td style={{ ...td, textAlign: "right" }} onClick={(event) => event.stopPropagation()}><span style={{ display: "inline-flex", gap: 5 }}><button title="Open" onClick={() => openCategory(category)} style={iconButtonStyle("#60a5fa")}><BookOpen size={14} /></button><button title="Delete category" onClick={() => deleteCategory(category)} disabled={saving} style={iconButtonStyle("#ef4444")}><Trash2 size={14} /></button></span></td></tr>)}</tbody>
          </table>
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          kind={confirmDelete.kind}
          name={(confirmDelete.item as Category | StoryItem).name_en}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeletion}
          loading={saving}
        />
      )}
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function Breadcrumb({ category, onBack }: { category?: string; onBack?: () => void }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", margin: "1rem 0" }}><span style={{ color: category ? "var(--accent)" : "var(--text)" }}>Stories</span>{category && <><ChevronRight size={12} /><span style={{ color: "var(--text)" }}>{category}</span>{onBack && <button className="btn" onClick={onBack} style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}><ArrowLeft size={13} /> Back</button>}</>}</div>;
}

function FilePicker({ label, file, onFile }: { label: string; file: File | null | undefined; onFile: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div><input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0] || null)} /><div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] || null); }} style={{ width: 180, height: 180, borderRadius: 16, border: "2px dashed var(--border)", background: "var(--card-bg)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 12, textAlign: "center" }}><CloudUpload size={40} style={{ color: file ? "var(--accent)" : "var(--text-muted)", opacity: file ? 1 : 0.5 }} /><span style={{ fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{file?.name || label}</span></div>{file && <button type="button" onClick={() => onFile(null)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><X size={12} /> Remove file</button>}</div>;
}

function Message({ ok, text }: { ok: boolean; text: string }) {
  return <div className={ok ? "alert alert-success" : "alert alert-error"} style={{ display: "flex", gap: 6, alignItems: "center" }}>{ok && <CheckCircle2 size={16} />}{text}</div>;
}

function Toast({ ok, text, onDone }: { ok: boolean; text: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 10000, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: ok ? "#166534" : "#7f1d1d", border: "1px solid " + (ok ? "#4ade80" : "#f87171"), color: ok ? "#4ade80" : "#f87171", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>{text}</div>;
}

function ConfirmModal({ kind, name, onCancel, onConfirm, loading }: { kind: "category" | "story"; name: string; onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  const noun = kind === "category" ? "category and all stories inside it" : "story";
  return <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <div className="card" style={{ width: "min(400px, 90vw)", margin: 0, padding: "24px 28px", border: "1px solid var(--border)" }}>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Delete {kind === "category" ? "Category" : "Story"}?</p>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>Delete "{name}" and its {noun}? This cannot be undone.</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }}>Cancel</button>
        <button onClick={onConfirm} disabled={loading} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 13, background: "#ef4444" }}>{loading ? "Deleting…" : "Delete"}</button>
      </div>
    </div>
  </div>;
}

const controlLabel = { display: "grid", gap: 6, minWidth: 180, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" } as const;
const th = { padding: "0.75rem 1rem", textAlign: "left" as const, color: "var(--text-muted)", fontWeight: 600 };
const td = { padding: "0.75rem 1rem" };
const tdMuted = { ...td, color: "var(--text-muted)" };
const tdStrong = { ...td, fontWeight: 600 };
function iconButtonStyle(color: string) {
  return { width: 26, height: 26, borderRadius: 5, border: "none", cursor: "pointer", background: color + "22", color, display: "flex", alignItems: "center", justifyContent: "center" } as const;
}

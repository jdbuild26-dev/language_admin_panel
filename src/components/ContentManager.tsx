"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus, Trash2, X, Save, Eye, Pencil, ExternalLink, Globe, AlertCircle, CheckCircle2, Loader2, Moon, Sun } from 'lucide-react';
import api from '../services/api';
import 'react-quill-new/dist/quill.snow.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Topic {
  id: number; slug: string; name_en: string; name_fr?: string;
  learning_lang: string; level_code: string;
  order_index: number; is_active: boolean; subtopics_count: number;
}
interface Subtopic {
  id: number; slug: string; topic_id: number; topic_name: string;
  name_en: string; name_fr?: string;
  order_index: number; is_active: boolean; notes_count: number;
}
interface Note {
  id: number; subtopic_id: number; concept_id: string;
  known_lang: string; learning_lang: string;
  title: string | null; html_url: string;
  order_index: number; is_active: boolean;
}

type View = 'topics' | 'subtopics' | 'notes' | 'editor';

interface EditorState {
  subtopicId: number;
  subtopicName: string;
  learningLang: string;
  existingNote: Note | null;
  translationFor: Note | null;
  takenLangs: string[];
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'];
const LANGUAGES = [
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
];
const KNOWN_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toast({ ok, msg, onDone }: { ok: boolean; msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`alert ${ok ? 'alert-success' : 'alert-error'}`}
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, minWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      {ok ? <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 8 }} /> : <AlertCircle size={16} style={{ display: 'inline', marginRight: 8 }} />}
      {msg}
    </div>
  );
}

function ConfirmModal({ title, body, onConfirm, onCancel, loading }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>{body}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return { width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: `${color}22`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' };
}

// ─── Preview helper ───────────────────────────────────────────────────────────
// The backend returns a full <!DOCTYPE html> page. We only need the body content
// ─── Rich Text Editor Modal (Quill-based) ────────────────────────────────────

// Quill toolbar config — comprehensive but not overwhelming
const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    [{ align: [] }],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'indent',
  'blockquote', 'code-block', 'link', 'image', 'align',
];

function NoteEditorView({ subtopicId, subtopicName, learningLang, existingNote, translationFor, takenLangs, onClose, onSaved, showToast }: {
  subtopicId: number; subtopicName: string; learningLang: string;
  existingNote?: Note | null;
  translationFor?: Note | null;
  takenLangs?: string[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [title, setTitle] = useState(existingNote?.title || translationFor?.title || '');
  const [knownLang, setKnownLang] = useState(() => {
    if (existingNote) return existingNote.known_lang;
    if (translationFor) {
      // Pick the first language not already taken
      const taken = new Set(takenLangs || [translationFor.known_lang]);
      const next = KNOWN_LANGS.find(l => !taken.has(l.code));
      return next?.code || 'en';
    }
    return 'en';
  });
  // For translations: lock concept_id to the source note's concept_id
  const [conceptId, setConceptId] = useState(
    existingNote?.concept_id || translationFor?.concept_id || ''
  );
  const isTranslation = !!translationFor && !existingNote;
  const conceptLocked = !!existingNote || isTranslation;

  const [htmlContent, setHtmlContent] = useState('');
  const [rawHtmlInput, setRawHtmlInput] = useState('');
  const [showRawHtmlPanel, setShowRawHtmlPanel] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Dark mode — persisted per editor session
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('editor_dark') === '1');

  // Dynamically import ReactQuill to avoid SSR issues
  const [ReactQuill, setReactQuill] = useState<any>(null);
  useEffect(() => {
    import('react-quill-new').then(mod => {
      setReactQuill(() => mod.default);
    });
  }, []);

  // Load existing content when editing
  useEffect(() => {
    if (existingNote) {
      setLoading(true);
      api.get(`/admin/grammar/notes/${existingNote.id}/markdown`)
        .then(r => {
          // markdown_source holds the raw HTML from Quill
          setHtmlContent(r.data.markdown_source || '');
        })
        .catch(() => setHtmlContent(''))
        .finally(() => setLoading(false));
    }
  }, [existingNote]);

  const isEmpty = (html: string) => {
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    return !stripped || stripped === '<br>';
  };

  // Inject raw HTML directly into Quill by setting it as the editor value
  const handleInjectRawHtml = () => {
    if (!rawHtmlInput.trim()) return;
    // Strip full HTML document wrapper if pasted (keep only body content)
    let html = rawHtmlInput.trim();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) html = bodyMatch[1].trim();
    // Set directly — Quill's controlled value prop parses HTML correctly
    setHtmlContent(html);
    setRawHtmlInput('');
    setShowRawHtmlPanel(false);
    setTab('write');
    showToast(true, 'HTML loaded into editor');
  };

  const handleSave = async () => {
    if (!title.trim()) { showToast(false, 'Title is required'); return; }
    if (!conceptId.trim()) { showToast(false, 'Concept ID is required'); return; }
    if (isEmpty(htmlContent)) { showToast(false, 'Content cannot be empty'); return; }
    setSaving(true);
    try {
      // We send the Quill HTML as markdown_source — the backend wraps it in the full page template
      if (existingNote) {
        await api.put(`/admin/grammar/notes/${existingNote.id}`, {
          markdown_source: htmlContent,
          title,
        });
        showToast(true, 'Note updated');
      } else {
        await api.post('/admin/grammar/notes', {
          subtopic_id: subtopicId,
          concept_id: conceptId,
          known_lang: knownLang,
          learning_lang: learningLang,
          markdown_source: htmlContent,
          title,
        });
        showToast(true, 'Note created');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dm = darkMode;
  const bg = dm ? '#0e1117' : '#ffffff';
  const surface = dm ? '#161b22' : '#f8f9fa';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';
  const inputBorder = dm ? '#30363d' : '#dee2e6';
  const previewBg = dm ? '#161b22' : '#f9f5f0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', background: bg, borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.5rem', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0 }}>
        {/* Left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 8px', borderRadius: 6 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: border, fontSize: 16 }}>|</span>
          <div>
            <span style={{ fontSize: 13, color: textMuted }}>{subtopicName} / </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
              {existingNote ? 'Edit Note' : isTranslation ? 'Add Translation' : 'Create Note'}
            </span>
            {isTranslation && <span style={{ marginLeft: 8, fontSize: 12, color: '#0969da', background: '#dbeafe', padding: '2px 8px', borderRadius: 4 }}>Translating: {conceptId}</span>}
          </div>
        </div>

        {/* Right: dark mode + save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { const next = !darkMode; setDarkMode(next); localStorage.setItem('editor_dark', next ? '1' : '0'); }}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={onClose} style={{ padding: '6px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '6px 18px', border: 'none', borderRadius: 6, background: '#0969da', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* ── Meta fields ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '0.875rem 1.5rem', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Perfect Nouns in French"
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: inputBg, color: textPrimary }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concept ID *</label>
          <input value={conceptId} onChange={e => setConceptId(e.target.value)}
            placeholder="e.g. fr-a1-nouns-perfect" disabled={conceptLocked}
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: conceptLocked ? (dm ? '#1c2128' : '#f8f9fa') : inputBg, color: textPrimary, opacity: conceptLocked ? 0.7 : 1 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explanation Language</label>
          <select value={knownLang} onChange={e => setKnownLang(e.target.value)} disabled={!!existingNote}
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', background: existingNote ? (dm ? '#1c2128' : '#f8f9fa') : inputBg, color: textPrimary, opacity: existingNote ? 0.7 : 1 }}>
            {KNOWN_LANGS.map(l => {
              const isTaken = isTranslation && (takenLangs || []).includes(l.code);
              return <option key={l.code} value={l.code} disabled={isTaken}>{l.label}{isTaken ? ' (exists)' : ''}</option>;
            })}
          </select>
        </div>
      </div>

      {/* ── Tab bar + Paste HTML button ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0, alignItems: 'center' }}>
        {(['write', 'preview'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 22px', background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#0969da' : textMuted, borderBottom: tab === t ? '2px solid #0969da' : '2px solid transparent', fontWeight: tab === t ? 600 : 400, fontSize: 13 }}>
            {t === 'write' ? '✏️ Write' : '👁 Preview'}
          </button>
        ))}
        <button
          onClick={() => setShowRawHtmlPanel(p => !p)}
          style={{ marginLeft: 'auto', marginRight: 12, padding: '5px 12px', border: `1px solid ${border}`, borderRadius: 6, background: showRawHtmlPanel ? '#0969da' : 'transparent', color: showRawHtmlPanel ? '#fff' : textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
          {'</>'} Paste HTML
        </button>
      </div>

      {/* ── Paste HTML panel ── */}
      {showRawHtmlPanel && (
        <div style={{ padding: '10px 1.5rem', borderBottom: `1px solid ${border}`, background: dm ? '#1c2128' : '#f0f6ff', flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>Paste raw HTML — click <strong>Inject</strong> to load into editor.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={rawHtmlInput} onChange={e => setRawHtmlInput(e.target.value)}
              placeholder="<h1>Title</h1><p>Content...</p>" rows={3}
              style={{ flex: 1, padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: inputBg, color: textPrimary }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={handleInjectRawHtml} disabled={!rawHtmlInput.trim()}
                style={{ padding: '7px 14px', border: 'none', borderRadius: 6, background: '#0969da', color: '#fff', cursor: rawHtmlInput.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, opacity: rawHtmlInput.trim() ? 1 : 0.5 }}>
                Inject
              </button>
              <button onClick={() => { setRawHtmlInput(''); setShowRawHtmlPanel(false); }}
                style={{ padding: '7px 14px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor / Preview ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: textMuted }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading content…</span>
          </div>
        ) : tab === 'write' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 1.5rem 1rem' }}>
            {/* Quill dark mode override */}
            {dm && <style>{`.ql-toolbar { background: #161b22 !important; border-color: #30363d !important; } .ql-container { border-color: #30363d !important; background: #0e1117; } .ql-editor { color: #c9d1d9 !important; background: #0e1117; } .ql-editor.ql-blank::before { color: #8b949e !important; } .ql-stroke { stroke: #8b949e !important; } .ql-fill { fill: #8b949e !important; } .ql-picker { color: #8b949e !important; } .ql-picker-options { background: #161b22 !important; border-color: #30363d !important; } .ql-picker-item { color: #c9d1d9 !important; }`}</style>}
            {ReactQuill ? (
              <ReactQuill
                theme="snow"
                value={htmlContent}
                onChange={setHtmlContent}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder="Start writing your note here… Use the toolbar above for formatting."
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: '1rem' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: textMuted }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
                Loading editor…
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: previewBg }}>
            {isEmpty(htmlContent) ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: textMuted }}>Nothing to preview yet — write something first.</div>
            ) : (
              <div className="note-preview" dangerouslySetInnerHTML={{ __html: htmlContent }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Notes View ───────────────────────────────────────────────────────────────

function NotesView({ subtopic, onBack, onOpenEditor, showToast }: {
  subtopic: Subtopic;
  onBack: () => void;
  onOpenEditor: (state: { existingNote: Note | null; translationFor: Note | null; takenLangs: string[] }) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/grammar/notes', { params: { subtopic_id: subtopic.id } });
      setNotes(r.data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [subtopic.id]);

  useEffect(() => { load(); }, [load]);

  // Group notes by concept_id
  const grouped = notes.reduce<Record<string, Note[]>>((acc, n) => {
    if (!acc[n.concept_id]) acc[n.concept_id] = [];
    acc[n.concept_id].push(n);
    return acc;
  }, {});

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/grammar/notes/${confirmDelete.id}`);
      showToast(true, 'Note deleted');
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const langLabel = (code: string) => KNOWN_LANGS.find(l => l.code === code)?.label || code.toUpperCase();

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back to subtopics
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{subtopic.name_en}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Notes & Translations</p>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenEditor({ existingNote: null, translationFor: null, takenLangs: [] })}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Create Note
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
          Loading notes...
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <Globe size={40} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No notes yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Create the first note for this subtopic.</p>
          <button className="btn btn-primary" onClick={() => onOpenEditor({ existingNote: null, translationFor: null, takenLangs: [] })}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Create Note
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(grouped).map(([conceptId, conceptNotes]) => (
            <div key={conceptId} className="card" style={{ padding: '1.25rem' }}>
              {/* Concept header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{conceptNotes[0].title || conceptId}</h3>
                  <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{conceptId}</code>
                </div>
                <button
                  onClick={() => onOpenEditor({ existingNote: null, translationFor: conceptNotes[0], takenLangs: conceptNotes.map(n => n.known_lang) })}
                  style={{ ...iconBtn('#1f6feb'), width: 'auto', padding: '0 12px', gap: 6, fontSize: 13 }}>
                  <Plus size={14} /> Add Translation
                </button>
              </div>

              {/* Translations list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conceptNotes.map(note => (
                  <div key={note.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(31,111,235,0.15)', color: '#60a5fa', borderRadius: 4, padding: '2px 8px' }}>
                        {langLabel(note.known_lang)}
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text)' }}>{note.title || 'Untitled'}</span>
                      {!note.is_active && (
                        <span style={{ fontSize: 11, background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>INACTIVE</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Preview link — always available via the serve endpoint */}
                      <a
                        href={`${(api.defaults as any).baseURL || 'http://localhost:8000/api'}/admin/grammar/notes/${note.id}/html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...iconBtn('#2ea043'), textDecoration: 'none' }}
                        title="Preview compiled note"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {/* Edit */}
                      <button title="Edit" onClick={() => onOpenEditor({ existingNote: note, translationFor: null, takenLangs: [] })} style={iconBtn('#f59e0b')}>
                        <Pencil size={14} />
                      </button>
                      {/* Delete */}
                      <button title="Delete" onClick={() => setConfirmDelete(note)} style={iconBtn('#ef4444')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Note"
          body={`Delete the ${langLabel(confirmDelete.known_lang)} translation of "${confirmDelete.title || confirmDelete.concept_id}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Subtopics View ───────────────────────────────────────────────────────────

function SubtopicsView({ topic, onBack, onSelectSubtopic, showToast }: {
  topic: Topic; onBack: () => void;
  onSelectSubtopic: (s: Subtopic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Subtopic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/grammar/subtopics', { params: { topic_id: topic.id } });
      setSubtopics(r.data.subtopics || []);
    } catch {
      setSubtopics([]);
    } finally {
      setLoading(false);
    }
  }, [topic.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post('/admin/grammar/subtopics', { topic_id: topic.id, name_en: newName.trim() });
      showToast(true, `Created "${newName}"`);
      setNewName(''); setCreating(false); load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/grammar/subtopics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back to topics
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{topic.name_en}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {topic.level_code} · {LANGUAGES.find(l => l.code === topic.learning_lang)?.label || topic.learning_lang}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Add Subtopic
        </button>
      </div>

      {/* Inline create form */}
      {creating && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-control" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
            placeholder='e.g. "Perfect Nouns"' style={{ flex: 1, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
            {saving ? 'Saving...' : 'Create'}
          </button>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
        </div>
      ) : subtopics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No subtopics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Add subtopics like "Perfect Nouns", "Plural Forms", etc.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Add Subtopic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 50 }}>#</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Subtopic</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 100 }}>Notes</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subtopics.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectSubtopic(s)}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name_en}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    <span style={{ background: 'rgba(31,111,235,0.12)', color: '#60a5fa', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {s.notes_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelectSubtopic(s)} style={iconBtn('#60a5fa')}><Eye size={14} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(s)} style={iconBtn('#ef4444')}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Subtopic"
          body={`Delete "${confirmDelete.name_en}" and all its notes? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Topics View ──────────────────────────────────────────────────────────────

function TopicsView({ learningLang, levelCode, onSelectTopic, showToast }: {
  learningLang: string; levelCode: string;
  onSelectTopic: (t: Topic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/grammar/topics', { params: { learning_lang: learningLang, level_code: levelCode } });
      setTopics(r.data.topics || []);
    } catch {
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [learningLang, levelCode]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post('/admin/grammar/topics', { name_en: newName.trim(), learning_lang: learningLang, level_code: levelCode });
      showToast(true, `Created "${newName}"`);
      setNewName(''); setCreating(false); load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Create failed — run the DB migration first');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/grammar/topics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Topics</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {LANGUAGES.find(l => l.code === learningLang)?.label || learningLang} · {levelCode}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Add Topic
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-control" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
            placeholder='e.g. "Nouns", "Verbs", "Tenses"' style={{ flex: 1, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
            {saving ? 'Saving...' : 'Create'}
          </button>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No topics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            {loading ? '' : 'Add your first topic from the syllabus, e.g. "Nouns", "Verbs", "Articles".'}
          </p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Add Topic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 50 }}>#</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Topic</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Subtopics</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectTopic(t)}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.name_en}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    <span style={{ background: 'rgba(31,111,235,0.12)', color: '#60a5fa', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {t.subtopics_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelectTopic(t)} style={iconBtn('#60a5fa')}><Eye size={14} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(t)} style={iconBtn('#ef4444')}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Topic"
          body={`Delete "${confirmDelete.name_en}" and all its subtopics and notes? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Root ContentManager ──────────────────────────────────────────────────────

interface ContentManagerProps {
  pageTitle: string;
  pageDescription: string;
}

export default function ContentManager({ pageTitle, pageDescription }: ContentManagerProps) {
  const [learningLang, setLearningLang] = useState('fr');
  const [levelCode, setLevelCode] = useState('A1');
  const [view, setView] = useState<View>('topics');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<Subtopic | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
  }, []);

  // Reset drill-down when language/level changes
  const handleLangChange = (lang: string) => {
    setLearningLang(lang);
    setView('topics');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };
  const handleLevelChange = (level: string) => {
    setLevelCode(level);
    setView('topics');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };

  return (
    <div>
      <h1>{pageTitle}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: 15 }}>{pageDescription}</p>

      {/* Language + Level selectors */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem', padding: '1.25rem 1.5rem', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 120 }}>Learning Language</span>
          <select className="form-control" value={learningLang} onChange={e => handleLangChange(e.target.value)} style={{ width: 180, fontSize: 14 }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 100 }}>CEFR Level</span>
          <select className="form-control" value={levelCode} onChange={e => handleLevelChange(e.target.value)} style={{ width: 180, fontSize: 14 }}>
            {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Breadcrumb trail */}
        {(view === 'subtopics' || view === 'notes' || view === 'editor') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <button onClick={() => { setView('topics'); setSelectedTopic(null); setSelectedSubtopic(null); setEditorState(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, padding: 0 }}>
              Topics
            </button>
            {selectedTopic && (
              <>
                <span>/</span>
                <button onClick={() => { setView('subtopics'); setSelectedSubtopic(null); setEditorState(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: (view === 'notes' || view === 'editor') ? 'var(--accent)' : 'var(--white)', fontSize: 13, padding: 0 }}>
                  {selectedTopic.name_en}
                </button>
              </>
            )}
            {selectedSubtopic && (view === 'notes' || view === 'editor') && (
              <>
                <span>/</span>
                <button onClick={() => { setView('notes'); setEditorState(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: view === 'editor' ? 'var(--accent)' : 'var(--white)', fontSize: 13, padding: 0 }}>
                  {selectedSubtopic.name_en}
                </button>
              </>
            )}
            {view === 'editor' && editorState && (
              <>
                <span>/</span>
                <span style={{ color: 'var(--white)' }}>
                  {editorState.existingNote ? 'Edit' : editorState.translationFor ? 'Translate' : 'Create'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* DB migration warning banner — shown when API returns 500/table not found */}
      <div id="db-warning" style={{ display: 'none', marginBottom: '1rem' }} />

      {/* Views */}
      {view === 'topics' && (
        <TopicsView
          learningLang={learningLang}
          levelCode={levelCode}
          onSelectTopic={t => { setSelectedTopic(t); setView('subtopics'); }}
          showToast={showToast}
        />
      )}
      {view === 'subtopics' && selectedTopic && (
        <SubtopicsView
          topic={selectedTopic}
          onBack={() => { setView('topics'); setSelectedTopic(null); }}
          onSelectSubtopic={s => { setSelectedSubtopic(s); setView('notes'); }}
          showToast={showToast}
        />
      )}
      {view === 'notes' && selectedSubtopic && selectedTopic && (
        <NotesView
          subtopic={selectedSubtopic}
          onBack={() => { setView('subtopics'); setSelectedSubtopic(null); }}
          onOpenEditor={({ existingNote, translationFor, takenLangs }) => {
            setEditorState({ subtopicId: selectedSubtopic.id, subtopicName: selectedSubtopic.name_en, learningLang, existingNote, translationFor, takenLangs });
            setView('editor');
          }}
          showToast={showToast}
        />
      )}
      {view === 'editor' && editorState && selectedSubtopic && (
        <NoteEditorView
          subtopicId={editorState.subtopicId}
          subtopicName={editorState.subtopicName}
          learningLang={editorState.learningLang}
          existingNote={editorState.existingNote}
          translationFor={editorState.translationFor}
          takenLangs={editorState.takenLangs}
          onClose={() => { setView('notes'); setEditorState(null); }}
          onSaved={() => { setView('notes'); setEditorState(null); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}



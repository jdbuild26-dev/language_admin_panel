"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus, Trash2, X, Save, Eye, Pencil, ExternalLink, Globe, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../services/api';

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

// ─── Markdown Editor Modal ────────────────────────────────────────────────────

function MarkdownEditorModal({ subtopicId, learningLang, existingNote, onClose, onSaved, showToast }: {
  subtopicId: number; learningLang: string;
  existingNote?: Note | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [title, setTitle] = useState(existingNote?.title || '');
  const [knownLang, setKnownLang] = useState(existingNote?.known_lang || 'en');
  const [conceptId, setConceptId] = useState(existingNote?.concept_id || '');
  const [markdown, setMarkdown] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [loadingMd, setLoadingMd] = useState(false);

  // Load existing markdown if editing
  useEffect(() => {
    if (existingNote) {
      setLoadingMd(true);
      api.get(`/admin/grammar/notes/${existingNote.id}/markdown`)
        .then(r => setMarkdown(r.data.markdown_source || ''))
        .catch(() => setMarkdown(''))
        .finally(() => setLoadingMd(false));
    }
  }, [existingNote]);

  const handlePreview = async () => {
    try {
      const r = await api.post('/admin/grammar/preview-markdown', { markdown_text: markdown });
      setPreviewHtml(r.data.html || '');
      setTab('preview');
    } catch {
      showToast(false, 'Preview failed — is the backend running?');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { showToast(false, 'Title is required'); return; }
    if (!conceptId.trim()) { showToast(false, 'Concept ID is required'); return; }
    if (!markdown.trim()) { showToast(false, 'Content cannot be empty'); return; }
    setSaving(true);
    try {
      if (existingNote) {
        await api.put(`/admin/grammar/notes/${existingNote.id}`, { markdown_source: markdown, title });
        showToast(true, 'Note updated');
      } else {
        await api.post('/admin/grammar/notes', {
          subtopic_id: subtopicId, concept_id: conceptId,
          known_lang: knownLang, learning_lang: learningLang,
          markdown_source: markdown, title,
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

  const PLACEHOLDER = `# ${title || 'Note Title'}

Write your grammar explanation here. You can use:

## Headings

**Bold text**, *italic text*, \`inline code\`

## Tables

| French | English |
|--------|---------|
| le chat | the cat |
| la maison | the house |

## Code blocks

\`\`\`
Example sentence here
\`\`\`

## Lists

- Point one
- Point two
  - Sub-point
`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 1000, padding: '1.5rem' }}>
      <div style={{ background: 'var(--sidebar-bg)', borderRadius: 16, width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{existingNote ? 'Edit Note' : 'Create Note'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {/* Meta fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</label>
            <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Perfect Nouns in French" style={{ fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concept ID *</label>
            <input className="form-control" value={conceptId} onChange={e => setConceptId(e.target.value)}
              placeholder="e.g. fr-a1-nouns-perfect" disabled={!!existingNote}
              style={{ fontSize: 14, opacity: existingNote ? 0.6 : 1 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explanation Language</label>
            <select className="form-control" value={knownLang} onChange={e => setKnownLang(e.target.value)} disabled={!!existingNote} style={{ fontSize: 14 }}>
              {KNOWN_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['write', 'preview'] as const).map(t => (
            <button key={t} onClick={() => t === 'preview' ? handlePreview() : setTab('write')}
              style={{ padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? 'var(--white)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', fontWeight: tab === t ? 600 : 400, fontSize: 14 }}>
              {t === 'write' ? '✏️ Write' : '👁 Preview'}
            </button>
          ))}
        </div>

        {/* Editor / Preview */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {loadingMd ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : tab === 'write' ? (
            <textarea
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              placeholder={PLACEHOLDER}
              style={{ width: '100%', height: '100%', background: 'var(--bg)', border: 'none', outline: 'none', padding: '1.5rem', color: 'var(--text)', fontFamily: '"Fira Code", "Cascadia Code", monospace', fontSize: 14, lineHeight: 1.7, resize: 'none', boxSizing: 'border-box' }}
            />
          ) : (
            <iframe
              srcDoc={previewHtml}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              title="Preview"
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{markdown.length} chars · {markdown.split('\n').length} lines</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} style={{ display: 'inline', marginRight: 6 }} />
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Notes View ───────────────────────────────────────────────────────────────

function NotesView({ subtopic, learningLang, onBack, showToast }: {
  subtopic: Subtopic; learningLang: string;
  onBack: () => void; showToast: (ok: boolean, msg: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [_addTranslationFor, setAddTranslationFor] = useState<Note | null>(null);
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
        <button className="btn btn-primary" onClick={() => { setEditingNote(null); setAddTranslationFor(null); setEditorOpen(true); }}>
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
          <button className="btn btn-primary" onClick={() => { setEditingNote(null); setEditorOpen(true); }}>
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
                  onClick={() => { setAddTranslationFor(conceptNotes[0]); setEditingNote(null); setEditorOpen(true); }}
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
                      {/* Preview link */}
                      {note.html_url && !note.html_url.startsWith('__pending__') && (
                        <a href={note.html_url} target="_blank" rel="noopener noreferrer"
                          style={{ ...iconBtn('#2ea043'), textDecoration: 'none' }} title="Preview compiled note">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {note.html_url?.startsWith('__pending__') && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>pending upload</span>
                      )}
                      {/* Edit */}
                      <button title="Edit" onClick={() => { setEditingNote(note); setAddTranslationFor(null); setEditorOpen(true); }} style={iconBtn('#f59e0b')}>
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

      {/* Markdown editor modal */}
      {editorOpen && (
        <MarkdownEditorModal
          subtopicId={subtopic.id}
          learningLang={learningLang}
          existingNote={editingNote}
          onClose={() => { setEditorOpen(false); setEditingNote(null); setAddTranslationFor(null); }}
          onSaved={load}
          showToast={showToast}
        />
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
        {(view === 'subtopics' || view === 'notes') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <button onClick={() => { setView('topics'); setSelectedTopic(null); setSelectedSubtopic(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, padding: 0 }}>
              Topics
            </button>
            {selectedTopic && (
              <>
                <span>/</span>
                <button onClick={() => { setView('subtopics'); setSelectedSubtopic(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: view === 'notes' ? 'var(--accent)' : 'var(--white)', fontSize: 13, padding: 0 }}>
                  {selectedTopic.name_en}
                </button>
              </>
            )}
            {selectedSubtopic && view === 'notes' && (
              <>
                <span>/</span>
                <span style={{ color: 'var(--white)' }}>{selectedSubtopic.name_en}</span>
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
          learningLang={learningLang}
          onBack={() => { setView('subtopics'); setSelectedSubtopic(null); }}
          showToast={showToast}
        />
      )}

      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

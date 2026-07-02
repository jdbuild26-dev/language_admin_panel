import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, Plus, Eye, Pencil, Trash2, X, Save, Power,
  AlertCircle, CheckCircle2, CloudUpload, ChevronRight,
} from 'lucide-react';
import api from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
type CefrLevel = typeof CEFR_LEVELS[number];
const LANGUAGES = [
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
] as const;

interface GrammarTopic {
  id: number;
  slug: string;
  name_en: string;
  name_fr?: string;
  level_code: string;
  is_active: boolean;
  subtopics_count: number;
}

interface GrammarSubtopic {
  id: number;
  slug: string;
  name_en: string;
  name_fr?: string;
  name_de?: string;
  name_es?: string;
  is_active: boolean;
  exercise_type_slug?: GrammarExerciseTypeSlug;
}

// The exercise types available for Grammar Practice subtopics.
const GRAMMAR_EXERCISE_TYPES = [
  { slug: 'four_options',        name: 'Choose from Options',       desc: 'Select the correct answer from the choices' },
  { slug: 'fill_blanks_options', name: 'Fill in the Blanks',       desc: 'Choose from options to fill in the blanks' },
  { slug: 'grammar_reorder',     name: 'Reorder the Sentences',    desc: 'Build sentences by reordering words' },
  { slug: 'grammar_rewrite',     name: 'Rewrite the Sentences',    desc: 'Rewrite sentences based on instructions' },
] as const;
type GrammarExerciseTypeSlug = typeof GRAMMAR_EXERCISE_TYPES[number]['slug'];

interface ExerciseSubtype {
  id: string;
  subtype_slug: string;
  type_slug: string;
}

interface ExerciseRow {
  id: string;
  external_id: string;
  level: string | null;
  type_slug: string | null;
  is_active: boolean;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function Toast({ ok, msg, onDone }: { ok: boolean; msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      background: ok ? '#166534' : '#7f1d1d',
      border: `1px solid ${ok ? '#4ade80' : '#f87171'}`,
      color: ok ? '#4ade80' : '#f87171',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>{msg}</div>
  );
}

function ConfirmModal({ title, body, onConfirm, onCancel, loading }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, background: 'var(--card-bg)', borderRadius: 10, padding: '24px 28px',
        width: 'min(400px,90vw)', border: '1px solid var(--border)',
      }}>
        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>{body}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: 13, background: '#ef4444', borderColor: '#ef4444' }}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
    background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function CsvUploadButton({
  inputRef, onFile, disabled, label = 'Upload CSV', fileName, variant = 'button', onClear,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  fileName?: string;
  variant?: 'button' | 'dropzone';
  onClear?: () => void;
}) {
  const fileInput = (
    <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
      onChange={e => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
      }} />
  );

  if (variant === 'dropzone') {
    return (
      <div>
        {fileInput}
        <div
          onClick={() => { if (!disabled) inputRef.current?.click(); }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (!disabled) {
              const file = e.dataTransfer.files[0];
              if (file) onFile(file);
            }
          }}
          style={{
            width: 180, height: 180, borderRadius: 16, border: '2px dashed var(--border)',
            background: 'var(--card-bg)', cursor: disabled ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 12, padding: 12, textAlign: 'center',
          }}
        >
          <CloudUpload size={40} style={{ color: fileName ? 'var(--accent)' : 'var(--text-muted)', opacity: fileName ? 1 : 0.5 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
            {fileName || label}
          </span>
        </div>
        {fileName && onClear && (
          <button type="button" onClick={onClear} disabled={disabled}
            style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={12} /> Remove file
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {fileInput}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
        className="btn btn-secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px' }}>
        <CloudUpload size={15} />
        {label}
      </button>
      {fileName && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fileName}</span>}
    </div>
  );
}

// ─── Slide 1: Topics (Categories) ────────────────────────────────────────────
function Slide1Topics({
  learningLang, level, onSelect, showToast,
}: {
  learningLang: string;
  level: CefrLevel;
  onSelect: (topic: GrammarTopic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [topics, setTopics] = useState<GrammarTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GrammarTopic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/grammar/topics', {
        params: { learning_lang: learningLang, level_code: level },
      });
      setTopics(r.data.topics || []);
    } catch { setTopics([]); }
    finally { setLoading(false); }
  }, [learningLang, level]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!nameEn.trim()) return;
    setSaving(true);
    try {
      await api.post('/admin/grammar/topics', {
        name_en: nameEn.trim(), name_fr: nameFr.trim() || undefined,
        learning_lang: learningLang, level_code: level, order_index: topics.length,
      });
      showToast(true, `Created "${nameEn}"`);
      setNameEn(''); setNameFr(''); setShowCreate(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Create failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/grammar/topics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      setTopics(prev => prev.filter(t => t.id !== confirmDelete.id));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Delete failed');
    } finally { setDeleteLoading(false); setConfirmDelete(null); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Grammar Categories</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13 }}>
          <Plus size={15} /> New Category
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: '1.5rem', border: '1px solid var(--accent)' }}>
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>New Category</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="form-control" placeholder="Name (EN) e.g. Nouns *"
              value={nameEn} onChange={e => setNameEn(e.target.value)}
              style={{ flex: 1, minWidth: 180 }} />
            <input className="form-control" placeholder="Name (FR) optional"
              value={nameFr} onChange={e => setNameFr(e.target.value)}
              style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !nameEn.trim()}
              style={{ padding: '7px 16px', fontSize: 13 }}>
              {saving ? 'Saving…' : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}
              style={{ padding: '7px 12px', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No categories yet. Click <strong>New Category</strong> to create one.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 50, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>Sl No</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>Subtopics</th>
                <th style={{ padding: '10px 14px', width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', opacity: t.is_active ? 1 : 0.45, cursor: 'pointer' }}
                  onClick={() => onSelect(t)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {t.name_en}
                    {t.name_fr && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{t.name_fr}</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{t.subtopics_count} subtopic{t.subtopics_count !== 1 ? 's' : ''}</td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelect(t)} style={iconBtnStyle('#60a5fa')}><ChevronRight size={13} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(t)} style={iconBtnStyle('#ef4444')}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal title="Delete Category"
          body={`Delete "${confirmDelete.name_en}" and all its subtopics and exercises? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading} />
      )}
    </div>
  );
}

// ─── Slide 2: Subtopics ───────────────────────────────────────────────────────
function Slide2Subtopics({
  topic, level, onBack, onSelect, showToast,
}: {
  topic: GrammarTopic; level: CefrLevel;
  onBack: () => void;
  onSelect: (sub: GrammarSubtopic, typeSlug?: GrammarExerciseTypeSlug) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [subtopics, setSubtopics] = useState<GrammarSubtopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [nameDe, setNameDe] = useState('');
  const [nameEs, setNameEs] = useState('');
  const [exerciseTypeSlug, setExerciseTypeSlug] = useState<GrammarExerciseTypeSlug | ''>('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GrammarSubtopic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const createCsvInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subtopicsResponse, subtypeResponse] = await Promise.all([
        api.get('/admin/grammar/subtopics', { params: { topic_id: topic.id } }),
        api.get('/admin/exercise-subtypes').catch(() => ({ data: { items: [] } })),
      ]);
      const typeBySubtopicId = new Map<number, GrammarExerciseTypeSlug>();
      (subtypeResponse.data.items || []).forEach((subtype: ExerciseSubtype) => {
        const match = /^grammar_(\d+)$/.exec(subtype.subtype_slug);
        if (
          match
          && GRAMMAR_EXERCISE_TYPES.some(type => type.slug === subtype.type_slug)
        ) {
          typeBySubtopicId.set(Number(match[1]), subtype.type_slug as GrammarExerciseTypeSlug);
        }
      });
      setSubtopics((subtopicsResponse.data.subtopics || []).map((subtopic: GrammarSubtopic) => ({
        ...subtopic,
        exercise_type_slug: typeBySubtopicId.get(subtopic.id),
      })));
    } catch { setSubtopics([]); }
    finally { setLoading(false); }
  }, [topic.id]);

  useEffect(() => { load(); }, [load]);

  const closeCreateDialog = () => {
    setNameEn('');
    setNameFr('');
    setNameDe('');
    setNameEs('');
    setExerciseTypeSlug('');
    setCsvFile(null);
    if (createCsvInputRef.current) createCsvInputRef.current.value = '';
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!nameEn.trim() || !exerciseTypeSlug) return;
    setSaving(true);
    try {
      const response = await api.post('/admin/grammar/subtopics', {
        topic_id: topic.id, name_en: nameEn.trim(),
        name_fr: nameFr.trim() || undefined,
        name_de: nameDe.trim() || undefined,
        name_es: nameEs.trim() || undefined,
        order_index: subtopics.length,
      });
      const createdSubtopic: GrammarSubtopic = {
        id: response.data.id,
        slug: response.data.slug,
        name_en: nameEn.trim(),
        name_fr: nameFr.trim() || undefined,
        name_de: nameDe.trim() || undefined,
        name_es: nameEs.trim() || undefined,
        is_active: true,
        exercise_type_slug: exerciseTypeSlug,
      };
      let subtypeId: string | null = null;
      try {
        const subtypeResponse = await api.post('/admin/exercise-subtypes', {
          name_en: createdSubtopic.name_en,
          name_fr: createdSubtopic.name_fr,
          name_de: createdSubtopic.name_de,
          name_es: createdSubtopic.name_es,
          subtype_slug: `grammar_${createdSubtopic.id}`,
          type_slug: exerciseTypeSlug,
        });
        subtypeId = subtypeResponse.data.id;
      } catch (error) {
        await api.delete(`/admin/grammar/subtopics/${createdSubtopic.id}`).catch(() => {});
        throw error;
      }

      let uploadedCount: string | null = null;
      try {
        if (csvFile) {
          const formData = new FormData();
          formData.append('file', csvFile, csvFile.name);
          formData.append('skill', 'Grammar');
          formData.append('type_slug', exerciseTypeSlug);
          formData.append('category', `grammar_${createdSubtopic.id}`);
          const uploadResponse = await api.post('/admin/sync/exercises', formData);
          uploadedCount = uploadResponse.data?.message?.match(/\d+/)?.[0] ?? '?';
        }
      } catch (error) {
        if (subtypeId) {
          await api.delete(`/admin/exercise-subtypes/${subtypeId}`).catch(() => {});
        }
        await api.delete(`/admin/grammar/subtopics/${createdSubtopic.id}`).catch(() => {});
        throw error;
      }

      showToast(
        true,
        uploadedCount
          ? `Created "${nameEn}" and uploaded ${uploadedCount} exercises`
          : `Created "${nameEn}"`,
      );
      closeCreateDialog();
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Create failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/grammar/subtopics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      setSubtopics(prev => prev.filter(s => s.id !== confirmDelete.id));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Delete failed');
    } finally { setDeleteLoading(false); setConfirmDelete(null); }
  };

  if (showCreate) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.5rem' }}>
          <button onClick={closeCreateDialog} disabled={saving}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            CEFR Level: <strong style={{ color: 'var(--white)' }}>{level}</strong>
            &nbsp;&nbsp;Category: <strong style={{ color: 'var(--white)' }}>{topic.name_en}</strong>
          </span>
        </div>

        <h2 style={{ marginBottom: '1.5rem' }}>Create Grammar Practice Subtopic</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: '2rem', alignItems: 'start' }}>
          <div>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.25rem', fontSize: 16 }}>Subtopic Name</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.75rem', alignItems: 'center' }}>
                <label style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-muted)' }}>English Name *</label>
                <input className="form-control" autoFocus value={nameEn} onChange={e => setNameEn(e.target.value)}
                  placeholder="e.g. Proper Nouns Part 1" style={{ marginBottom: 0 }} />
                <label style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-muted)' }}>French Name</label>
                <input className="form-control" value={nameFr} onChange={e => setNameFr(e.target.value)}
                  placeholder="Name in French" style={{ marginBottom: 0 }} />
                <label style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-muted)' }}>German Name</label>
                <input className="form-control" value={nameDe} onChange={e => setNameDe(e.target.value)}
                  placeholder="Name in German" style={{ marginBottom: 0 }} />
                <label style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-muted)' }}>Spanish Name</label>
                <input className="form-control" value={nameEs} onChange={e => setNameEs(e.target.value)}
                  placeholder="Name in Spanish" style={{ marginBottom: 0 }} />
              </div>
            </div>

            <div className="card">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Exercise Type *</label>
                <select className="form-control" value={exerciseTypeSlug}
                  onChange={e => {
                    setExerciseTypeSlug(e.target.value as GrammarExerciseTypeSlug);
                    setCsvFile(null);
                    if (createCsvInputRef.current) createCsvInputRef.current.value = '';
                  }}>
                  <option value="">Select Exercise Type</option>
                  {GRAMMAR_EXERCISE_TYPES.map(type => (
                    <option key={type.slug} value={type.slug}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={closeCreateDialog} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}
                disabled={saving || !nameEn.trim() || !exerciseTypeSlug}>
                {saving ? 'Saving…' : 'Create Subtopic'}
              </button>
            </div>
          </div>

          <div>
            <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 10px' }}>CSV Upload</p>
            {exerciseTypeSlug ? (
              <CsvUploadButton
                inputRef={createCsvInputRef}
                onFile={setCsvFile}
                disabled={saving}
                fileName={csvFile?.name}
                label="Upload Master CSV"
                variant="dropzone"
                onClear={() => {
                  setCsvFile(null);
                  if (createCsvInputRef.current) createCsvInputRef.current.value = '';
                }}
              />
            ) : (
              <div style={{
                width: 180, height: 180, borderRadius: 16, border: '2px dashed var(--border)',
                background: 'var(--card-bg)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 16, textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 12,
              }}>
                Select an exercise type to upload its CSV
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.25rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          CEFR Level: <strong style={{ color: 'var(--white)' }}>{level}</strong>
          &nbsp;&nbsp;Category: <strong style={{ color: 'var(--white)' }}>{topic.name_en}</strong>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>{topic.name_en}</h2>
        <button onClick={() => setShowCreate(true)} title="Add Subtopic"
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)',
            border: 'none', cursor: 'pointer', color: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Plus size={18} />
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : subtopics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No subtopics yet. Click <strong>New Subtopic</strong> to create one.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 50, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>Sl No</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700 }}>Subtopic</th>
                <th style={{ padding: '10px 14px', width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {subtopics.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', opacity: s.is_active ? 1 : 0.45, cursor: 'pointer' }}
                  onClick={() => onSelect(s, s.exercise_type_slug)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {s.name_en}
                    {s.name_fr && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{s.name_fr}</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelect(s, s.exercise_type_slug)} style={iconBtnStyle('#60a5fa')}><ChevronRight size={13} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(s)} style={iconBtnStyle('#ef4444')}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal title="Delete Subtopic"
          body={`Delete "${confirmDelete.name_en}" and all its exercises? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading} />
      )}
    </div>
  );
}

// ─── Slide 3: Choose Exercise Type ───────────────────────────────────────────
function Slide3ExerciseTypes({
  topic, subtopic, level, onBack, onSelect,
}: {
  topic: GrammarTopic; subtopic: GrammarSubtopic; level: CefrLevel;
  onBack: () => void;
  onSelect: (typeSlug: GrammarExerciseTypeSlug) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  // Check which types already have exercises for this subtopic
  const [usedSlugs, setUsedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/admin/exercises', {
      params: { level, page_size: 200, category: `grammar_${subtopic.id}` }
    }).then(r => {
      const slugs = new Set<string>((r.data.items || []).map((e: ExerciseRow) => e.type_slug || ''));
      setUsedSlugs(slugs);
    }).catch(() => {});
  }, [subtopic.id, level]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.25rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {topic.name_en} &rsaquo; <strong style={{ color: 'var(--white)' }}>{subtopic.name_en}</strong>
        </span>
      </div>

      <div style={{ marginBottom: '1.5rem', marginTop: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Choose Exercise Type</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Select the type of exercise to create under <strong>{subtopic.name_en}</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {GRAMMAR_EXERCISE_TYPES.map(et => {
          const hasExercises = usedSlugs.has(et.slug);
          return (
            <div key={et.slug}
              onClick={() => onSelect(et.slug as GrammarExerciseTypeSlug)}
              style={{
                padding: '16px 18px', borderRadius: 10, cursor: 'pointer',
                background: hasExercises ? 'rgba(96,165,250,0.08)' : 'var(--card-bg)',
                border: `1px solid ${hasExercises ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = hasExercises ? 'rgba(96,165,250,0.4)' : 'var(--border)')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{et.name}</p>
                {hasExercises && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    HAS EXERCISES
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{et.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Slide 4: Exercises List ──────────────────────────────────────────────────
function Slide4Exercises({
  topic, subtopic, exerciseTypeSlug, level, onBack, showToast,
}: {
  topic: GrammarTopic; subtopic: GrammarSubtopic;
  exerciseTypeSlug: GrammarExerciseTypeSlug; level: CefrLevel;
  onBack: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExerciseRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const exerciseTypeName = GRAMMAR_EXERCISE_TYPES.find(e => e.slug === exerciseTypeSlug)?.name ?? exerciseTypeSlug;
  // Grammar exercises use category = grammar_{subtopic_id} to scope them
  const grammarCategory = `grammar_${subtopic.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/exercises', {
        params: { type_slug: exerciseTypeSlug, level, category: grammarCategory, page_size: 200 }
      });
      setExercises(r.data.items || []);
    } catch { setExercises([]); }
    finally { setLoading(false); }
  }, [exerciseTypeSlug, level, grammarCategory]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/exercises/${confirmDelete.external_id}`);
      showToast(true, `Deleted ${confirmDelete.external_id}`);
      setExercises(prev => prev.filter(e => e.id !== confirmDelete.id));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Delete failed');
    } finally { setDeleteLoading(false); setConfirmDelete(null); }
  };

  const handleToggleActive = async (ex: ExerciseRow) => {
    try {
      const r = await api.patch(`/admin/exercises/${ex.external_id}/toggle-active`);
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, is_active: r.data.is_active } : e));
      showToast(true, `${ex.is_active ? 'Deactivated' : 'Activated'} ${ex.external_id}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Update failed');
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('skill', 'Grammar');
      fd.append('type_slug', exerciseTypeSlug);
      fd.append('category', grammarCategory);
      const result = await api.post('/admin/sync/exercises', fd);
      const count = result.data?.message?.match(/\d+/)?.[0] ?? '?';
      showToast(true, `Uploaded ${count} exercises`);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.25rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {topic.name_en} &rsaquo; {subtopic.name_en} &rsaquo; <strong style={{ color: 'var(--white)' }}>{exerciseTypeName}</strong>
        </span>
      </div>

      {/* Title + Upload */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{subtopic.name_en} — {exerciseTypeName}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>
            Slug: <code style={{ fontSize: 11 }}>{exerciseTypeSlug}</code>
            &nbsp;·&nbsp;Category: <code style={{ fontSize: 11 }}>{grammarCategory}</code>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CsvUploadButton
            inputRef={fileInputRef}
            onFile={handleUpload}
            disabled={uploading}
            label={uploading ? 'Uploading…' : 'Upload CSV'}
          />
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : exercises.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No exercises yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 120 }}></th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'underline' }}>ExID</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>Exercise Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', width: 80 }}>Level</th>
              </tr>
            </thead>
            <tbody>
              {exercises.map(ex => (
                <tr key={ex.id} style={{ borderBottom: '1px solid var(--border)', opacity: ex.is_active === false ? 0.45 : 1 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <button title="View" onClick={() => setViewingId(ex.external_id)} style={iconBtnStyle('#60a5fa')}><Eye size={13} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(ex)} style={iconBtnStyle('#ef4444')}><Trash2 size={13} /></button>
                      <button title={ex.is_active === false ? 'Activate' : 'Deactivate'}
                        onClick={() => handleToggleActive(ex)}
                        style={iconBtnStyle(ex.is_active === false ? '#2ea043' : '#ef4444')}>
                        <Power size={13} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{ex.external_id}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{ex.type_slug ?? '—'}</td>
                  <td style={{ padding: '9px 14px' }}>{ex.level ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View/Edit modals */}
      {exercises.map(ex => viewingId === ex.external_id && (
        <GrammarViewModal key={ex.external_id} externalId={ex.external_id}
          onClose={() => setViewingId(null)}
          onSaved={() => { showToast(true, `Saved ${ex.external_id}`); load(); }} />
      ))}

      {confirmDelete && (
        <ConfirmModal title="Delete Exercise"
          body={`Delete exercise "${confirmDelete.external_id}"? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading} />
      )}
    </div>
  );
}

// ─── Grammar View/Edit Modal (reuses same pattern as MainPractice) ────────────
function GrammarViewModal({ externalId, onClose, onSaved }: {
  externalId: string; onClose: () => void; onSaved: () => void;
}) {
  const [row, setRow] = useState<Record<string, string | number | boolean | null> | null>(null);
  const [originalRow, setOriginalRow] = useState<Record<string, string | number | boolean | null> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/admin/exercises/${externalId.trim()}/excel-row`);
      setRow(r.data.row); setOriginalRow(r.data.row);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'Failed to load');
    } finally { setLoading(false); }
  }, [externalId]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, value: string) => {
    setRow(prev => prev ? { ...prev, [key]: value } : prev);
    setIsDirty(true); setSaved(false);
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await api.put(`/admin/exercises/${externalId.trim()}/excel-row`, { row });
      setOriginalRow(row); setSaved(true); setIsDirty(false); setIsEditMode(false); onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleClose = () => {
    if (isEditMode && isDirty) { setShowUnsaved(true); } else { onClose(); }
  };

  const renderCell = (key: string) => {
    const val = String(row![key] ?? '');
    const isLong = val.length > 60 || key.toLowerCase().includes('passage') || key.toLowerCase().includes('sample');
    if (isEditMode) {
      return isLong
        ? <textarea value={val} onChange={e => handleChange(key, e.target.value)} rows={3}
            style={{ width: '100%', resize: 'vertical', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontFamily: 'inherit' }} />
        : <input type="text" value={val} onChange={e => handleChange(key, e.target.value)}
            style={{ width: '100%', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)' }} />;
    }
    return <span style={{ fontSize: 13, color: 'var(--text)', display: 'block', padding: '4px 0', wordBreak: 'break-word', lineHeight: 1.5 }}>{val || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}</span>;
  };

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 'min(780px,95vw)', maxHeight: '88vh',
        background: 'var(--card-bg)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>{externalId}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: isEditMode ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.12)', color: isEditMode ? '#f59e0b' : '#60a5fa', border: `1px solid ${isEditMode ? 'rgba(245,158,11,0.35)' : 'rgba(96,165,250,0.3)'}` }}>
              {isEditMode ? '✏️ EDIT MODE' : '👁 VIEW MODE'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && !isEditMode && <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} />Saved</span>}
            {!isEditMode && <button onClick={load} style={{ padding: '5px 12px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>Reload</button>}
            {isEditMode
              ? <button className="btn btn-primary" style={{ padding: '5px 14px', fontSize: 13 }} onClick={handleSave} disabled={saving}><Save size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />{saving ? 'Saving…' : 'Save Changes'}</button>
              : <button onClick={() => setIsEditMode(true)} style={{ padding: '5px 14px', fontSize: 13, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Pencil size={13} /> Edit</button>}
            <button onClick={handleClose} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
          </div>
        </div>
        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 16px' }}>
          {loading && <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Loading…</p>}
          {error && <div style={{ margin: '1rem', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontSize: 13 }}><AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />{error}</div>}
          {row && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {Object.keys(row).map(key => (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: 200 }}>{key}</td>
                    <td style={{ padding: '6px 8px' }}>{renderCell(key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {isEditMode && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.05)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setRow(originalRow); setIsDirty(false); setIsEditMode(false); }} style={{ padding: '6px 14px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
            <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: 13 }} onClick={handleSave} disabled={saving}><Save size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        )}
      </div>
      {showUnsaved && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1101, background: 'var(--card-bg)', borderRadius: 10, padding: '24px 28px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', border: '1px solid var(--border)', width: 'min(400px,90vw)', textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Unsaved Changes</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>You have unsaved edits. Save before closing?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => { setRow(originalRow); setIsDirty(false); setIsEditMode(false); onClose(); }} style={{ padding: '7px 16px', fontSize: 13, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', cursor: 'pointer' }}>Discard & Close</button>
              <button onClick={() => setShowUnsaved(false)} style={{ padding: '7px 16px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>Keep Editing</button>
              <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 13 }} onClick={async () => { setShowUnsaved(false); await handleSave(); }}>Save & Close</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Main GrammarPractice Page ────────────────────────────────────────────────
type Slide = 'topics' | 'subtopics' | 'exercise_types' | 'exercises';

export default function GrammarPractice() {
  const [learningLang, setLearningLang] = useState('fr');
  const [level, setLevel] = useState<CefrLevel>('A1');
  const [slide, setSlide] = useState<Slide>('topics');
  const [selectedTopic, setSelectedTopic] = useState<GrammarTopic | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<GrammarSubtopic | null>(null);
  const [selectedTypeSlug, setSelectedTypeSlug] = useState<GrammarExerciseTypeSlug | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => setToast({ ok, msg });

  const goToTopics = () => {
    setSlide('topics');
    setSelectedTopic(null); setSelectedSubtopic(null); setSelectedTypeSlug(null);
  };

  const handleLanguageChange = (language: string) => {
    setLearningLang(language);
    goToTopics();
  };

  const handleLevelChange = (nextLevel: CefrLevel) => {
    setLevel(nextLevel);
    goToTopics();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Grammar Practice</h1>
          {slide !== 'topics' && (
            <button onClick={goToTopics} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 4, padding: 0 }}>
              <ChevronLeft size={14} /> Back to Categories
            </button>
          )}
        </div>
      </div>

      {slide === 'topics' && (
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem', padding: '1.25rem 1.5rem', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 120 }}>Learning Language</span>
            <select className="form-control" value={learningLang} onChange={e => handleLanguageChange(e.target.value)} style={{ width: 180, fontSize: 14 }}>
              {LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 100 }}>CEFR Level</span>
            <select className="form-control" value={level} onChange={e => handleLevelChange(e.target.value as CefrLevel)} style={{ width: 180, fontSize: 14 }}>
              {CEFR_LEVELS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Breadcrumb trail */}
      {slide !== 'topics' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={goToTopics}>Grammar</span>
          {selectedTopic && (
            <>
              <ChevronRight size={12} />
              <span style={{ cursor: slide !== 'subtopics' ? 'pointer' : 'default', color: slide !== 'subtopics' ? 'var(--accent)' : 'var(--text)' }}
                onClick={() => slide !== 'subtopics' && setSlide('subtopics')}>
                {selectedTopic.name_en}
              </span>
            </>
          )}
          {selectedSubtopic && (
            <>
              <ChevronRight size={12} />
              <span
                style={{
                  cursor: slide !== 'exercise_types' && !selectedSubtopic.exercise_type_slug ? 'pointer' : 'default',
                  color: slide !== 'exercise_types' && !selectedSubtopic.exercise_type_slug ? 'var(--accent)' : 'var(--text)',
                }}
                onClick={() => {
                  if (slide !== 'exercise_types' && !selectedSubtopic.exercise_type_slug) {
                    setSlide('exercise_types');
                  }
                }}>
                {selectedSubtopic.name_en}
              </span>
            </>
          )}
          {selectedTypeSlug && (
            <>
              <ChevronRight size={12} />
              <span style={{ color: 'var(--text)' }}>
                {GRAMMAR_EXERCISE_TYPES.find(e => e.slug === selectedTypeSlug)?.name}
              </span>
            </>
          )}
        </div>
      )}

      {/* Slides */}
      {slide === 'topics' && (
        <Slide1Topics learningLang={learningLang} level={level}
          onSelect={t => { setSelectedTopic(t); setSlide('subtopics'); }}
          showToast={showToast} />
      )}

      {slide === 'subtopics' && selectedTopic && (
        <Slide2Subtopics topic={selectedTopic} level={level}
          onBack={() => setSlide('topics')}
          onSelect={(subtopic, typeSlug) => {
            setSelectedSubtopic(subtopic);
            if (typeSlug) {
              setSelectedTypeSlug(typeSlug);
              setSlide('exercises');
            } else {
              setSelectedTypeSlug(null);
              setSlide('exercise_types');
            }
          }}
          showToast={showToast} />
      )}

      {slide === 'exercise_types' && selectedTopic && selectedSubtopic && (
        <Slide3ExerciseTypes topic={selectedTopic} subtopic={selectedSubtopic} level={level}
          onBack={() => setSlide('subtopics')}
          onSelect={slug => { setSelectedTypeSlug(slug); setSlide('exercises'); }}
          showToast={showToast} />
      )}

      {slide === 'exercises' && selectedTopic && selectedSubtopic && selectedTypeSlug && (
        <Slide4Exercises topic={selectedTopic} subtopic={selectedSubtopic}
          exerciseTypeSlug={selectedTypeSlug} level={level}
          onBack={() => setSlide(selectedSubtopic.exercise_type_slug ? 'subtopics' : 'exercise_types')}
          showToast={showToast} />
      )}

      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

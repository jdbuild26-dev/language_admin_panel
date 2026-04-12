import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Eye, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, X, Edit2, Save } from 'lucide-react';
import api from '../services/api';

interface ExerciseSummary {
  id: string;
  external_id: string;
  level: string | null;
  category: string | null;
  type_slug: string | null;
  passage_id: string | null;
}

interface ExerciseDetail extends ExerciseSummary {
  instruction_en: string | null;
  instruction_fr: string | null;
  content: Record<string, unknown>;
  evaluation: Record<string, unknown>;
  config: Record<string, unknown>;
  metadata_: Record<string, unknown>;
}

interface ExcelRow {
  [key: string]: string | number | boolean | null;
}

interface QuestionTypeOption {
  slug: string;
  name: string | null;
}

type Tab = 'list' | 'detail' | 'editor';

// ── Inline table editor for a flat Excel-row dict ──────────────────────────
function ExcelRowEditor({
  externalId,
  onSaved,
}: {
  externalId: string;
  onSaved: () => void;
}) {
  const [row, setRow] = useState<ExcelRow | null>(null);
  const [typeSlug, setTypeSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!externalId.trim()) return;
    setLoading(true);
    setError('');
    setRow(null);
    setSaved(false);
    try {
      const r = await api.get(`/admin/exercises/${externalId.trim()}/excel-row`);
      setRow(r.data.row);
      setTypeSlug(r.data.type_slug || '');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load exercise row');
    } finally {
      setLoading(false);
    }
  }, [externalId]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, value: string) => {
    setRow(prev => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/exercises/${externalId.trim()}/excel-row`, { row });
      setSaved(true);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted">Loading row data...</p>;
  if (error) return (
    <div className="alert alert-error">
      <AlertCircle className="inline mr-2" size={16} />{error}
    </div>
  );
  if (!row) return null;

  // Group keys into logical sections
  const META_KEYS = ['ExerciseID', 'Level', 'Category', 'QuestionType', 'Difficulty', 'Exercise Tag', 'TimeLimitSeconds'];
  const INST_KEYS = ['Instruction_EN', 'Instruction_FR'];
  const metaEntries = META_KEYS.filter(k => k in row);
  const instEntries = INST_KEYS.filter(k => k in row);
  const otherEntries = Object.keys(row).filter(k => !META_KEYS.includes(k) && !INST_KEYS.includes(k));

  const renderField = (key: string) => {
    const val = String(row[key] ?? '');
    const isLong = val.length > 80 || key.toLowerCase().includes('paragraph') || key.toLowerCase().includes('passage');
    return (
      <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '8px 12px', fontWeight: 500, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: 220 }}>
          {key}
        </td>
        <td style={{ padding: '6px 8px' }}>
          {isLong ? (
            <textarea
              value={val}
              onChange={e => handleChange(key, e.target.value)}
              rows={3}
              style={{
                width: '100%', resize: 'vertical', fontSize: 13,
                background: 'var(--input-bg, var(--card-bg))',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 8px', color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <input
              type="text"
              value={val}
              onChange={e => handleChange(key, e.target.value)}
              style={{
                width: '100%', fontSize: 13,
                background: 'var(--input-bg, var(--card-bg))',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '5px 8px', color: 'var(--text)',
              }}
            />
          )}
        </td>
      </tr>
    );
  };

  const SectionHeader = ({ label }: { label: string }) => (
    <tr>
      <td colSpan={2} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', background: 'var(--card-bg)' }}>
        {label}
      </td>
    </tr>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{externalId}</span>
          {typeSlug && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{typeSlug}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}><CheckCircle2 size={14} className="inline mr-1" />Saved</span>}
          <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 13 }} onClick={load}>
            Reload
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: '5px 12px', fontSize: 13 }}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} className="inline mr-1" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-8">
          <AlertCircle className="inline mr-2" size={16} />{error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {metaEntries.length > 0 && <><SectionHeader label="Metadata" />{metaEntries.map(renderField)}</>}
            {instEntries.length > 0 && <><SectionHeader label="Instructions" />{instEntries.map(renderField)}</>}
            {otherEntries.length > 0 && <><SectionHeader label="Content" />{otherEntries.map(renderField)}</>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ReadingExercises() {
  const [tab, setTab] = useState<Tab>('list');

  // Filters
  const [typeSlug, setTypeSlug] = useState('');
  const [category, setCategory] = useState('');
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeOption[]>([]);

  // List state
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  // Detail state
  const [searchId, setSearchId] = useState('');
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Editor state
  const [editorId, setEditorId] = useState('');
  const [editorInputId, setEditorInputId] = useState('');

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<ExerciseSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    api.get('/admin/question-types').then(r => setQuestionTypes(r.data.items)).catch(() => {});
  }, []);

  const fetchList = useCallback(async (p = page) => {
    setListLoading(true);
    setListError('');
    try {
      const params: Record<string, string | number> = { page: p, page_size: pageSize };
      if (typeSlug) params.type_slug = typeSlug;
      if (category) params.category = category;
      const r = await api.get('/admin/exercises', { params });
      setExercises(r.data.items);
      setTotal(r.data.total);
      setPage(p);
    } catch (e: any) {
      setListError(e.response?.data?.detail || 'Failed to load exercises');
    } finally {
      setListLoading(false);
    }
  }, [typeSlug, category, page]);

  useEffect(() => { fetchList(1); }, [typeSlug, category]);

  const fetchDetail = async (id: string) => {
    if (!id.trim()) return;
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    try {
      const r = await api.get(`/admin/exercises/${id.trim()}`);
      setDetail(r.data);
    } catch (e: any) {
      setDetailError(e.response?.data?.detail || 'Exercise not found');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectExercise = (ex: ExerciseSummary) => {
    setSearchId(ex.external_id);
    setTab('detail');
    fetchDetail(ex.external_id);
  };

  const handleEditExercise = (ex: ExerciseSummary) => {
    setEditorId(ex.external_id);
    setEditorInputId(ex.external_id);
    setTab('editor');
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/exercises/${confirmDelete.external_id}`);
      setExercises(prev => prev.filter(e => e.id !== confirmDelete.id));
      setTotal(t => t - 1);
      showToast(true, `Deleted ${confirmDelete.external_id}`);
      if (detail?.external_id === confirmDelete.external_id) setDetail(null);
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <h1>Reading Exercises</h1>
      <p className="mb-8 text-muted">Browse, inspect, edit, and delete exercises by type and category.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['list', 'detail', 'editor'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn btn-secondary"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'list' ? 'Exercise List' : t === 'detail' ? 'Detail / Search' : 'Table Editor'}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`alert ${toast.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
          {toast.ok ? <CheckCircle2 className="inline mr-2" size={16} /> : <AlertCircle className="inline mr-2" size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div>
          <div className="grid grid-2 gap-2 mb-8">
            <div className="form-group">
              <label className="form-label">Question Type</label>
              <select className="form-control" value={typeSlug} onChange={e => setTypeSlug(e.target.value)}>
                <option value="">All types</option>
                {questionTypes.map(qt => (
                  <option key={qt.slug} value={qt.slug}>{qt.slug}{qt.name ? ` — ${qt.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                <option value="main">main</option>
                <option value="vocabulary">vocabulary</option>
                <option value="grammar">grammar</option>
              </select>
            </div>
          </div>

          {listError && (
            <div className="alert alert-error mb-8">
              <AlertCircle className="inline mr-2" size={16} />{listError}
            </div>
          )}

          {listLoading ? (
            <p className="text-muted">Loading...</p>
          ) : exercises.length === 0 ? (
            <p className="text-muted">No exercises found.</p>
          ) : (
            <>
              <p className="text-muted mb-4" style={{ fontSize: 13 }}>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}>
                      {['Exercise ID', 'Type Slug', 'Level', 'Category', 'Passage ID', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.map(ex => (
                      <tr key={ex.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace' }}>{ex.external_id}</td>
                        <td style={{ padding: '9px 14px' }}>{ex.type_slug ?? '—'}</td>
                        <td style={{ padding: '9px 14px' }}>{ex.level ?? '—'}</td>
                        <td style={{ padding: '9px 14px' }}>{ex.category ?? '—'}</td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: ex.passage_id ? 'inherit' : 'var(--text-muted)' }}>
                          {ex.passage_id ?? 'none'}
                        </td>
                        <td style={{ padding: '9px 14px', display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => handleSelectExercise(ex)}
                            title="View detail"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => handleEditExercise(ex)}
                            title="Edit in table editor"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: 12, background: 'var(--error-bg, #3b1a1a)', color: '#f87171', border: '1px solid #7f1d1d' }}
                            onClick={() => setConfirmDelete(ex)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex gap-2 mt-8" style={{ alignItems: 'center' }}>
                  <button className="btn btn-secondary" disabled={page <= 1} onClick={() => fetchList(page - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: 13 }}>Page {page} / {totalPages}</span>
                  <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => fetchList(page + 1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── DETAIL TAB ── */}
      {tab === 'detail' && (
        <div>
          <div className="form-group mb-8" style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              placeholder="Enter Exercise ID (external_id)..."
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchDetail(searchId)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={() => fetchDetail(searchId)} disabled={detailLoading || !searchId.trim()}>
              <Search size={16} />
              {detailLoading ? 'Loading...' : 'Fetch'}
            </button>
          </div>

          {detailError && (
            <div className="alert alert-error mb-8">
              <AlertCircle className="inline mr-2" size={16} />{detailError}
            </div>
          )}

          {detail && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'monospace', fontSize: 18 }}>{detail.external_id}</h2>
                  <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {detail.type_slug} · {detail.level ?? '?'} · {detail.category}
                    {detail.passage_id && <> · passage: <code>{detail.passage_id}</code></>}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px' }}
                    onClick={() => { setEditorId(detail.external_id); setEditorInputId(detail.external_id); setTab('editor'); }}
                  >
                    <Edit2 size={14} className="inline mr-1" /> Edit
                  </button>
                  <button
                    className="btn"
                    style={{ padding: '6px 12px', background: 'var(--error-bg, #3b1a1a)', color: '#f87171', border: '1px solid #7f1d1d' }}
                    onClick={() => setConfirmDelete(detail)}
                  >
                    <Trash2 size={14} className="inline mr-1" /> Delete
                  </button>
                </div>
              </div>

              {detail.instruction_en && (
                <p style={{ marginBottom: 8, fontSize: 13 }}><strong>Instruction (EN):</strong> {detail.instruction_en}</p>
              )}
              {detail.instruction_fr && (
                <p style={{ marginBottom: 16, fontSize: 13 }}><strong>Instruction (FR):</strong> {detail.instruction_fr}</p>
              )}

              {(['content', 'evaluation', 'config', 'metadata_'] as const).map(field => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{field}</p>
                  <pre style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    overflowX: 'auto',
                    margin: 0,
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}>
                    {JSON.stringify(detail[field], null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EDITOR TAB ── */}
      {tab === 'editor' && (
        <div>
          <div className="form-group mb-8" style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              placeholder="Enter Exercise ID to edit..."
              value={editorInputId}
              onChange={e => setEditorInputId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setEditorId(editorInputId)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => setEditorId(editorInputId)}
              disabled={!editorInputId.trim()}
            >
              <Edit2 size={16} />
              Load
            </button>
          </div>

          {editorId && (
            <ExcelRowEditor
              key={editorId}
              externalId={editorId}
              onSaved={() => showToast(true, `Saved ${editorId}`)}
            />
          )}
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 420, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Confirm Delete</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setConfirmDelete(null)}>
                <X size={16} />
              </button>
            </div>
            <p style={{ marginBottom: 20 }}>
              Delete exercise <code style={{ fontFamily: 'monospace' }}>{confirmDelete.external_id}</code>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} disabled={deleteLoading}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

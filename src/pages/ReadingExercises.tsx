import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Eye, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, X } from 'lucide-react';
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

interface QuestionTypeOption {
  slug: string;
  name: string | null;
}

type Tab = 'list' | 'detail';

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

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState<ExerciseSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load question types once
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
      <p className="mb-8 text-muted">Browse, inspect, and delete exercises by type and category.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-8" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['list', 'detail'] as Tab[]).map(t => (
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
            {t === 'list' ? 'Exercise List' : 'Detail / Search'}
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
          {/* Filters */}
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

              {/* Pagination */}
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
                <button
                  className="btn"
                  style={{ padding: '6px 12px', background: 'var(--error-bg, #3b1a1a)', color: '#f87171', border: '1px solid #7f1d1d' }}
                  onClick={() => setConfirmDelete(detail)}
                >
                  <Trash2 size={14} className="inline mr-1" /> Delete
                </button>
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

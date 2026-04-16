import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Save, Search, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import api from '../services/api';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface VocabItem {
  id: string;
  unique_id: string;
  word: string | null;
  word_masc: string | null;
  word_fem: string | null;
  word_neutral: string | null;
  gender_type: string | null;
  grammar_type: string | null;
  level: string | null;
  category: string | null;
  sub_category: string | null;
  sentence: string | null;
  image_url: string | null;
  pronunciation_url: string | null;
  word_ranking: number | null;
  english_word: string | null;
  english_sentence: string | null;
}

const emptyItem = (): Omit<VocabItem, 'id' | 'unique_id'> => ({
  word: '', word_masc: '', word_fem: '', word_neutral: '',
  gender_type: '', grammar_type: '',
  level: 'A1', category: '', sub_category: '',
  sentence: '', image_url: '', pronunciation_url: '',
  word_ranking: null,
  english_word: '', english_sentence: '',
});

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ ok, msg, onDone }: { ok: boolean; msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`alert ${ok ? 'alert-success' : 'alert-error'}`}
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, minWidth: 280, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      {ok ? <CheckCircle2 size={16} className="inline mr-2" /> : <AlertCircle size={16} className="inline mr-2" />}
      {msg}
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
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
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vocab Edit Modal ──────────────────────────────────────────────────────────
function VocabModal({
  initial, categories, onSave, onClose,
}: {
  initial: Partial<VocabItem>;
  categories: string[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!(initial as any).unique_id;
  const [form, setForm] = useState<any>({ ...emptyItem(), ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const [completing, setCompleting] = useState(false);
  const handleAIComplete = async () => {
    // If we have at least one field, we can try to complete
    if (!form.word?.trim() && !form.word_masc?.trim() && !form.word_fem?.trim() && !form.english_word?.trim()) {
      setError('Please enter at least one word form (French or English)');
      return;
    }

    setCompleting(true);
    setError('');
    try {
      const r = await api.post('/admin/vocabulary/ai-complete', form);
      setForm((f: any) => ({ ...f, ...r.data }));
    } catch (e: any) {
      setError('AI completion failed');
    } finally {
      setCompleting(false);
    }
  };

  const handleSave = async () => {
    if (!form.english_word?.trim() && !form.word?.trim() && !form.word_masc?.trim() && !form.word_fem?.trim()) {
      setError('At least one word form is required');
      return;
    }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (e: any) { setError(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontFamily: 'inherit',
  };

  const LabeledField = ({ label, k, placeholder }: { label: string; k: string; placeholder?: string }) => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="form-label" style={{ fontSize: 11 }}>{label}</label>
      <input style={fieldStyle} value={form[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ maxWidth: 720, width: '95%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          {isEdit ? 'Edit Vocabulary' : 'Add Vocabulary'}
          <button 
            className="btn btn-secondary" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', fontSize: 11, 
              background: 'rgba(96,165,250,0.1)', 
              color: '#3b82f6', 
              border: '1px solid rgba(96,165,250,0.2)',
              borderRadius: 6
            }}
            onClick={handleAIComplete}
            disabled={completing}
          >
            {completing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {completing ? 'Completing...' : 'AI Complete'}
          </button>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Left column */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>French Word Forms</div>
            <LabeledField label="Masculine" k="word_masc" placeholder="e.g. le chat" />
            <LabeledField label="Feminine" k="word_fem" placeholder="e.g. la chatte" />
            <LabeledField label="Neutral / No Gender" k="word_neutral" placeholder="e.g. l'eau" />
            <LabeledField label="Generic Word" k="word" placeholder="Base form" />

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '12px 0 8px', letterSpacing: '0.05em' }}>Grammar</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Gender Type</label>
                <select style={fieldStyle} value={form.gender_type ?? ''} onChange={e => set('gender_type', e.target.value)}>
                  <option value="">—</option>
                  <option value="masculine">Masculine</option>
                  <option value="feminine">Feminine</option>
                  <option value="neutral">Neutral</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <LabeledField label="Grammar Type" k="grammar_type" placeholder="e.g. noun, verb" />
            </div>
          </div>

          {/* Right column */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>English Translation</div>
            <LabeledField label="English Word" k="english_word" placeholder="e.g. cat" />
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: 11 }}>English Sentence</label>
              <textarea rows={2} style={{ ...fieldStyle, resize: 'vertical' }} value={form.english_sentence ?? ''} onChange={e => set('english_sentence', e.target.value)} placeholder="Example sentence in English" />
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '12px 0 8px', letterSpacing: '0.05em' }}>Metadata</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>CEFR Level</label>
                <select style={fieldStyle} value={form.level ?? 'A1'} onChange={e => set('level', e.target.value)}>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <LabeledField label="Word Ranking" k="word_ranking" placeholder="e.g. 100" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Category</label>
                <input style={fieldStyle} list="cat-list" value={form.category ?? ''} onChange={e => set('category', e.target.value)} placeholder="e.g. Animals" />
                <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <LabeledField label="Sub-Category" k="sub_category" placeholder="e.g. Pets" />
            </div>
          </div>
        </div>

        {/* French sentence - full width */}
        <div className="form-group" style={{ marginTop: 8, marginBottom: 8 }}>
          <label className="form-label" style={{ fontSize: 11 }}>French Example Sentence</label>
          <textarea rows={2} style={{ ...fieldStyle, resize: 'vertical' }} value={form.sentence ?? ''} onChange={e => set('sentence', e.target.value)} placeholder="Example sentence in French" />
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}><AlertCircle size={14} className="inline mr-1" />{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14} className="inline mr-1" />{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Word'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VocabularyEditor() {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubCat, setFilterSubCat] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Categories for autocomplete
  const [categories, setCategories] = useState<string[]>([]);

  // Modal state
  const [editItem, setEditItem] = useState<Partial<VocabItem> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VocabItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => setToast({ ok, msg });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, page_size: pageSize };
      if (filterLevel) params.level = filterLevel;
      if (filterCategory) params.category = filterCategory;
      if (filterSubCat) params.sub_category = filterSubCat;
      if (search) params.search = search;
      const r = await api.get('/admin/vocabulary', { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setPage(p);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterCategory, filterSubCat, search]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    api.get('/vocabulary/categories').then(r => setCategories(r.data.categories || [])).catch(() => {});
  }, []);

  const handleSave = async (data: any) => {
    if (editItem && (editItem as VocabItem).unique_id) {
      await api.put(`/admin/vocabulary/${(editItem as VocabItem).unique_id}`, data);
      showToast(true, 'Word updated');
    } else {
      await api.post('/admin/vocabulary', data);
      showToast(true, 'Word added');
    }
    setEditItem(null);
    load(page);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/vocabulary/${confirmDelete.unique_id}`);
      showToast(true, `Deleted "${confirmDelete.english_word || confirmDelete.word_masc || confirmDelete.word}"`);
      setItems(prev => prev.filter(i => i.unique_id !== confirmDelete.unique_id));
      setTotal(t => t - 1);
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const iconBtn = (color: string): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
    background: `${color}22`, color,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Vocabulary Editor</h1>
        <button className="btn btn-primary" onClick={() => setEditItem({})}>
          <Plus size={16} className="inline mr-1" /> Add Word
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Search */}
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Search</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-control" style={{ marginBottom: 0 }} placeholder="French or English word..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); load(1); } }} />
              <button className="btn btn-secondary" style={{ padding: '5px 10px', flexShrink: 0 }}
                onClick={() => { setSearch(searchInput); load(1); }}>
                <Search size={14} />
              </button>
            </div>
          </div>

          {/* Level filter */}
          <div style={{ minWidth: 100 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Level</label>
            <select className="form-control" style={{ marginBottom: 0 }} value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
              <option value="">All</option>
              {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Category filter */}
          <div style={{ minWidth: 160 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Category</label>
            <input className="form-control" style={{ marginBottom: 0 }} list="filter-cat-list"
              placeholder="All categories" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} />
            <datalist id="filter-cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </div>

          {/* Sub-category filter */}
          <div style={{ minWidth: 140 }}>
            <label className="form-label" style={{ fontSize: 11 }}>Sub-Category</label>
            <input className="form-control" style={{ marginBottom: 0 }} placeholder="All sub-categories"
              value={filterSubCat} onChange={e => setFilterSubCat(e.target.value)} />
          </div>

          <button className="btn btn-secondary" style={{ padding: '5px 12px', alignSelf: 'flex-end' }}
            onClick={() => { setFilterLevel(''); setFilterCategory(''); setFilterSubCat(''); setSearch(''); setSearchInput(''); }}>
            Clear
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {loading ? 'Loading...' : `${total.toLocaleString()} words`}
        </span>
        {totalPages > 1 && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            — Page {page} / {totalPages}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 80 }}></th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', minWidth: 120 }}>French Word</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', minWidth: 120 }}>English</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 60 }}>Level</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', minWidth: 100 }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', minWidth: 100 }}>Sub-Cat</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Gender</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Grammar</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', minWidth: 200 }}>French Sentence</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 60 }}>Rank</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No vocabulary found. Try adjusting filters or add a new word.</td></tr>
              ) : (
                items.map(item => (
                  <tr key={item.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 14px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button title="Edit" onClick={() => setEditItem(item)} style={iconBtn('#f59e0b')}>
                          <Pencil size={13} />
                        </button>
                        <button title="Delete" onClick={() => setConfirmDelete(item)} style={iconBtn('#ef4444')}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>
                      {item.word_masc && <span style={{ color: '#60a5fa' }}>{item.word_masc}</span>}
                      {item.word_masc && item.word_fem && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>}
                      {item.word_fem && <span style={{ color: '#f472b6' }}>{item.word_fem}</span>}
                      {!item.word_masc && !item.word_fem && (item.word_neutral || item.word || '—')}
                    </td>
                    <td style={{ padding: '8px 14px' }}>{item.english_word || '—'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      {item.level && (
                        <span style={{ background: 'rgba(31,111,235,0.15)', color: 'var(--accent)', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>
                          {item.level}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{item.category || '—'}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{item.sub_category || '—'}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{item.gender_type || '—'}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{item.grammar_type || '—'}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.sentence || '—'}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{item.word_ranking ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => load(page - 1)} style={{ padding: '6px 12px' }}>
            <ChevronLeft size={14} className="inline" /> Prev
          </button>
          <span style={{ fontSize: 13 }}>Page {page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => load(page + 1)} style={{ padding: '6px 12px' }}>
            Next <ChevronRight size={14} className="inline" />
          </button>
        </div>
      )}

      {/* Modals */}
      {editItem !== null && (
        <VocabModal
          initial={editItem}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditItem(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Delete Word"
          body={`Delete "${confirmDelete.english_word || confirmDelete.word_masc || confirmDelete.word}"? This removes all language rows for unique_id ${confirmDelete.unique_id}.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteLoading}
        />
      )}
      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Save, Search, Filter } from 'lucide-react';
import api from '../services/api';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const CATEGORIES = ['Skill', 'Topic', 'Pronoun', 'Verb', 'Concept'] as const;

interface TagTopic {
    id: number;
    slug: string;
    name_en: string;
    name_fr: string | null;
    name_de: string | null;
    name_hi: string | null;
    category: string;
    level_id: number;
    level_code: string;
}

interface TagTopicPayload {
    slug: string;
    name_en: string;
    name_fr?: string;
    name_de?: string;
    name_hi?: string;
    category?: string;
    level_id?: number;
}

// ── Modal ────────────────────────────────────────────────────────────────────
function TagModal({
    initial, onSave, onClose,
}: {
    initial: Partial<TagTopic>;
    onSave: (data: TagTopicPayload) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState<TagTopicPayload>({
        slug: initial.slug || '',
        name_en: initial.name_en || '',
        name_fr: initial.name_fr || '',
        name_de: initial.name_de || '',
        name_hi: initial.name_hi || '',
        category: initial.category || 'Topic',
        level_id: initial.level_id || 1,
    } as TagTopicPayload);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (k: keyof TagTopicPayload, v: any) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.slug.trim()) { setError('Slug is required'); return; }
        if (!form.name_en.trim()) { setError('English Name is required'); return; }
        setSaving(true);
        setError('');
        try { await onSave(form); }
        catch (e: any) { setError(e.response?.data?.detail || 'Save failed'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: 600, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                    <X size={20} />
                </button>
                <h2 style={{ marginBottom: '1.5rem' }}>{(initial as any).id ? 'Edit Tag Topic' : 'New Tag Topic'}</h2>

                <div className="grid grid-2 gap-2 mb-4">
                    <div className="form-group">
                        <label className="form-label">Slug *</label>
                        <input className="form-control" value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="a1/grammar/verbs" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Category</label>
                        <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Level</label>
                        <select className="form-control" value={form.level_id} onChange={e => set('level_id', parseInt(e.target.value))}>
                            {LEVELS.map((lvl, idx) => <option key={lvl} value={idx + 1}>{lvl}</option>)}
                        </select>
                    </div>
                </div>

                <div className="form-group mb-4">
                    <label className="form-label">Name (English) *</label>
                    <input className="form-control" value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="Present Tense" />
                </div>

                <div className="grid grid-2 gap-2 mb-4">
                    <div className="form-group">
                        <label className="form-label">Name (French)</label>
                        <input className="form-control" value={form.name_fr ?? ''} onChange={e => set('name_fr', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Name (German)</label>
                        <input className="form-control" value={form.name_de ?? ''} onChange={e => set('name_de', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Name (Hindi)</label>
                        <input className="form-control" value={form.name_hi ?? ''} onChange={e => set('name_hi', e.target.value)} />
                    </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        <Save size={16} style={{ marginRight: 6 }} />
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TagTopics() {
    const [tags, setTags] = useState<TagTopic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Filters
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('All');
    const [categoryFilter, setCategoryFilter] = useState('All');

    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; data: Partial<TagTopic> } | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get<{ tags: TagTopic[] }>('/admin/tag-topics');
            setTags(res.data.tags);
        } catch { setError('Failed to load tag topics'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleSave = async (data: TagTopicPayload) => {
        if (modal?.mode === 'edit' && (modal.data as TagTopic).id) {
            await api.put(`/admin/tag-topics/${(modal.data as TagTopic).id}`, data);
        } else {
            await api.post('/admin/tag-topics', data);
        }
        setModal(null);
        load();
    };

    const handleDelete = async (id: number) => {
        await api.delete(`/admin/tag-topics/${id}`);
        setDeleteId(null);
        load();
    };

    const filteredTags = tags.filter(t => {
        const matchesSearch = t.name_en.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase());
        const matchesLevel = levelFilter === 'All' || t.level_code === levelFilter;
        const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
        return matchesSearch && matchesLevel && matchesCategory;
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0 }}>Tag Topics Management</h1>
                <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', data: {} })}>
                    <Plus size={16} style={{ marginRight: 6 }} /> New Tag
                </button>
            </div>

            {/* Filters */}
            <div className="card mb-4" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                    <input 
                        className="form-control" 
                        style={{ paddingLeft: '2.5rem' }} 
                        placeholder="Search by name or slug..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Filter size={16} style={{ opacity: 0.4 }} />
                    <select className="form-control" style={{ width: 100 }} value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
                        <option value="All">All Levels</option>
                        {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="form-control" style={{ width: 140 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="All">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {loading ? (
                <div className="text-center p-10 text-muted">Loading tag topics...</div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem 1rem' }}>Name (EN)</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Slug</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Level</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                                <th style={{ padding: '0.75rem 1rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTags.map(t => (
                                <tr key={t.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{t.name_en}</td>
                                    <td style={{ padding: '0.75rem 1rem', opacity: 0.6, fontSize: '0.85rem' }}>{t.slug}</td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span className={`badge badge-level-${t.level_code.toLowerCase()}`}>
                                            {t.level_code}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span className="badge" style={{ background: 'var(--bg-muted, #252528)' }}>{t.category}</span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }}
                                                onClick={() => setModal({ mode: 'edit', data: t })}>
                                                <Pencil size={14} />
                                            </button>
                                            <button className="btn" style={{ padding: '0.3rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                                                onClick={() => setDeleteId(t.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredTags.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>No tag topics found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && (
                <TagModal
                    initial={modal.data}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}

            {deleteId !== null && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }}>
                        <h3>Delete tag topic?</h3>
                        <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>This might affect content mapping. Proceed with caution.</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                            <button className="btn" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}
                                onClick={() => handleDelete(deleteId)}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Save, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

interface Prompt {
    id: number;
    slug: string;
    topic: string;
    ai_role: string | null;
    user_role: string | null;
    instructions: Record<string, string | null>;
    ai_prompts: Record<string, string | null>;
}

type FlatPrompt = Omit<Prompt, 'instructions' | 'ai_prompts'> & {
    instruction_a1: string; instruction_a2: string; instruction_b1: string;
    instruction_b2: string; instruction_c1: string; instruction_c2: string;
    ai_prompt_a1: string; ai_prompt_a2: string; ai_prompt_b1: string;
    ai_prompt_b2: string; ai_prompt_c1: string; ai_prompt_c2: string;
};

const emptyFlat = (): Omit<FlatPrompt, 'id'> => ({
    slug: '', topic: '', ai_role: '', user_role: '',
    instruction_a1: '', instruction_a2: '', instruction_b1: '',
    instruction_b2: '', instruction_c1: '', instruction_c2: '',
    ai_prompt_a1: '', ai_prompt_a2: '', ai_prompt_b1: '',
    ai_prompt_b2: '', ai_prompt_c1: '', ai_prompt_c2: '',
});

function toFlat(p: Prompt): FlatPrompt {
    return {
        id: p.id, slug: p.slug, topic: p.topic,
        ai_role: p.ai_role ?? '', user_role: p.user_role ?? '',
        instruction_a1: p.instructions.A1 ?? '', instruction_a2: p.instructions.A2 ?? '',
        instruction_b1: p.instructions.B1 ?? '', instruction_b2: p.instructions.B2 ?? '',
        instruction_c1: p.instructions.C1 ?? '', instruction_c2: p.instructions.C2 ?? '',
        ai_prompt_a1: p.ai_prompts.A1 ?? '', ai_prompt_a2: p.ai_prompts.A2 ?? '',
        ai_prompt_b1: p.ai_prompts.B1 ?? '', ai_prompt_b2: p.ai_prompts.B2 ?? '',
        ai_prompt_c1: p.ai_prompts.C1 ?? '', ai_prompt_c2: p.ai_prompts.C2 ?? '',
    };
}

// ── Modal ────────────────────────────────────────────────────────────────────
function PromptModal({
    initial, onSave, onClose,
}: {
    initial: Partial<FlatPrompt>;
    onSave: (data: Omit<FlatPrompt, 'id'>) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState<Omit<FlatPrompt, 'id'>>({ ...emptyFlat(), ...initial });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [openLevel, setOpenLevel] = useState<string>('A1');

    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.topic.trim()) { setError('Topic is required'); return; }
        setSaving(true);
        setError('');
        try { await onSave(form); }
        catch (e: any) { setError(e.response?.data?.detail || 'Save failed'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: 760, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                    <X size={20} />
                </button>
                <h2 style={{ marginBottom: '1.5rem' }}>{(initial as any).id ? 'Edit Prompt' : 'New Prompt'}</h2>

                {/* Core fields */}
                <div className="grid grid-2 gap-2 mb-4">
                    <div className="form-group">
                        <label className="form-label">Topic *</label>
                        <input className="form-control" value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Ordering coffee" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Slug (auto if blank)</label>
                        <input className="form-control" value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="ordering-coffee" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">AI Role</label>
                        <input className="form-control" value={form.ai_role ?? ''} onChange={e => set('ai_role', e.target.value)} placeholder="e.g. Barista" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">User Role</label>
                        <input className="form-control" value={form.user_role ?? ''} onChange={e => set('user_role', e.target.value)} placeholder="e.g. Customer" />
                    </div>
                </div>

                {/* Per-level accordion */}
                {LEVELS.map(lvl => {
                    const iKey = `instruction_${lvl.toLowerCase()}` as keyof typeof form;
                    const pKey = `ai_prompt_${lvl.toLowerCase()}` as keyof typeof form;
                    const open = openLevel === lvl;
                    return (
                        <div key={lvl} style={{ border: '1px solid var(--border, #333)', borderRadius: 8, marginBottom: 8 }}>
                            <button
                                onClick={() => setOpenLevel(open ? '' : lvl)}
                                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
                            >
                                Level {lvl}
                                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {open && (
                                <div style={{ padding: '0 1rem 1rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">User Instruction</label>
                                        <textarea className="form-control" rows={3} value={(form[iKey] as string) ?? ''} onChange={e => set(iKey, e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">AI System Prompt</label>
                                        <textarea className="form-control" rows={4} value={(form[pKey] as string) ?? ''} onChange={e => set(pKey, e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PromptsEditor() {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; data: Partial<FlatPrompt> } | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get<{ prompts: Prompt[] }>('/admin/prompts');
            setPrompts(res.data.prompts);
        } catch { setError('Failed to load prompts'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleSave = async (data: Omit<FlatPrompt, 'id'>) => {
        if (modal?.mode === 'edit' && (modal.data as FlatPrompt).id) {
            await api.put(`/admin/prompts/${(modal.data as FlatPrompt).id}`, data);
        } else {
            await api.post('/admin/prompts', data);
        }
        setModal(null);
        load();
    };

    const handleDelete = async (id: number) => {
        await api.delete(`/admin/prompts/${id}`);
        setDeleteId(null);
        load();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0 }}>AI Practice Prompts</h1>
                <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', data: {} })}>
                    <Plus size={16} style={{ marginRight: 6 }} /> New Prompt
                </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {loading ? (
                <div className="text-center p-10">Loading prompts…</div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem 1rem' }}>Topic</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Slug</th>
                                <th style={{ padding: '0.75rem 1rem' }}>AI Role</th>
                                <th style={{ padding: '0.75rem 1rem' }}>User Role</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Levels</th>
                                <th style={{ padding: '0.75rem 1rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {prompts.map(p => {
                                const filledLevels = LEVELS.filter(l => p.instructions[l] || p.ai_prompts[l]);
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{p.topic}</td>
                                        <td style={{ padding: '0.75rem 1rem', opacity: 0.6, fontSize: '0.85rem' }}>{p.slug}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>{p.ai_role ?? '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>{p.user_role ?? '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                {LEVELS.map(l => (
                                                    <span key={l} className={`badge ${filledLevels.includes(l) ? 'badge-success' : ''}`}
                                                        style={!filledLevels.includes(l) ? { opacity: 0.25 } : {}}>
                                                        {l}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem' }}
                                                    onClick={() => setModal({ mode: 'edit', data: toFlat(p) })}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button className="btn" style={{ padding: '0.3rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                                                    onClick={() => setDeleteId(p.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {prompts.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>No prompts yet. Create one above.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Edit / Create modal */}
            {modal && (
                <PromptModal
                    initial={modal.data}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Delete confirmation */}
            {deleteId !== null && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }}>
                        <h3>Delete prompt?</h3>
                        <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>This cannot be undone.</p>
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

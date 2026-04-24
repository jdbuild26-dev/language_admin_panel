import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Plus, Eye, Pencil, Trash2, X, Save, Download, BarChart3, MessageSquare, Power, AlertCircle, CheckCircle2, Upload, FileSpreadsheet, CloudUpload, Sparkles, Check } from 'lucide-react';
import api from '../services/api';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
const CATEGORIES = ['Reading', 'Listening', 'Writing', 'Speaking'] as const;
type CefrLevel = typeof CEFR_LEVELS[number];
type Category = typeof CATEGORIES[number];
type Slide = 'main' | 'subtypes' | 'exercises' | 'create';

interface QuestionType { slug: string; name: string | null; is_active: boolean; }

interface ExerciseSubtype {
  id: string;
  name_en: string;
  name_fr: string;
  name_de: string;
  name_es: string;
  identifier_start: string;
  identifier_end: string;
  subtype_slug: string;
  is_active: boolean;
}

interface ExerciseRow {
  id: string;
  external_id: string;
  level: string | null;
  category: string | null;
  type_slug: string | null;
  is_active: boolean;
  image_url?: string;
  content?: {
    image_url?: string;
    [key: string]: any;
  };
}

interface Prompt {
  id?: string;
  topic?: string;
  slug?: string;
  ai_role?: string;
  user_role?: string;
  [key: string]: any;
}

interface AiExercise extends Record<string, any> {
  ExerciseID: string;
  dbStatus?: 'ready' | 'saving' | 'saved' | 'error';
}

interface ExcelRow { [key: string]: string | number | boolean | null; }

// ─── Skill → type_slug mapping ────────────────────────────────────────────────
// Mirrors the live practice page (language-app.rust.vercel.app/practice).
// Update this whenever new exercise types are added to the practice page.
const SKILL_SLUGS: Record<Category, string[]> = {
  Reading: [
    'translate_bubbles',         // Translate the Sentence
    'match_pairs',               // Match Pairs
    'highlight_text',            // Highlight the Sentence
    'diagram_mapping',           // Diagram Labelling
    'image_mcq',                 // Match Image to Description
    'match_desc_to_image',       // Match Description to Image
    'image_labelling',           // Image Labelling
    'passage_mcq',               // Reading Comprehension
    'complete_passage_dropdown', // Complete the Passage
    'fill_blanks_passage',       // Fill in the Blanks Passage
    'fill_blanks',               // Fill in the Blanks (alias)
    'reorder_sentences',         // Reorder Sentences
    'true_false',                // Identify Information
    'conversation_dialogue',     // Running Conversation
    'summary_completion',        // Summary Completion
    'match_sentence_ending',     // Match Sentence Ending
    'sentence_completion',       // Sentence Completion
    'reading_conversation',      // Reading Conversation
  ],
  Listening: [
    'listen_select',             // Listen and Select
    'type_what_you_hear',        // Listen and Type
    'listen_fill_blanks',        // Audio Fill in the Blanks
    'listen_fill_blanks_dropdown', // Audio Fill in the Blanks 2
    'listen_bubble',             // What do you hear?
    'listen_order',              // Listen and Order
    'listen_passage',            // Passage Questions
    'listen_interactive',        // Interactive Listening
    'listening_comprehension',   // Listening Comprehension
    'listening_conversation',    // Running Conversation (Listening)
  ],
  Writing: [
    'translate_typed',           // Translate the Sentence
    'correct_spelling',          // Fix the Spelling
    'write_fill_blanks',         // Fill in the Blanks
    'write_topic',               // Write About Topic
    'write_image',               // Write About Image
    'write_documents',           // Write Documents
    'write_interactive',         // Interactive Writing
    'writing_conversation',      // Writing Conversation (Running)
    'write_analysis',            // Write About Data
    'summarise_audio',           // Summarise What You Hear
  ],
  Speaking: [
    'speak_translate',           // Translate by Speaking
    'speak_topic',               // Speak About Topic
    'speak_image',               // Speak About Image / Describe Image
    'speak_interactive',         // Interactive Speaking
    'speaking_conversation',     // Speaking Conversation (Running)
  ],
};

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Confirm Modal ────────────────────────────────────────────────────────────
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
            {loading ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Modal ─────────────────────────────────────────────────────────
function AnalyticsModal({ qt, onClose }: { qt: QuestionType; onClose: () => void }) {
  const [data, setData] = useState<{ total: number; by_level: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/admin/question-types/${qt.slug}/analytics`)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [qt.slug]);

  const maxCount = data ? Math.max(...Object.values(data.by_level), 1) : 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ maxWidth: 480, width: '90%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        <h3 style={{ marginBottom: 4 }}>Analytics</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem', fontFamily: 'monospace' }}>{qt.slug}</p>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
        {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
        {data && (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--white)' }}>{data.total}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Total Exercises</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--white)' }}>{Object.keys(data.by_level).length}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Levels with Data</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CEFR_LEVELS.map(lvl => {
                const count = data.by_level[lvl] || 0;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 28, fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>{lvl}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: count > 0 ? 'var(--accent)' : 'transparent', borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ width: 36, textAlign: 'right', fontSize: 13, fontWeight: 600, color: count > 0 ? 'var(--white)' : 'var(--text-muted)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI Prompts Modal (editable) ─────────────────────────────────────────────
function PromptsModal({ qt, onClose, showToast }: { qt: QuestionType; onClose: () => void; showToast: (ok: boolean, msg: string) => void }) {
  const [data, setData] = useState<{ prompt: Prompt } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [openLevel, setOpenLevel] = useState<string>('A1');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/question-types/${qt.slug}/prompt`)
      .then(r => {
        setData(r.data);
        const p = r.data?.prompt;
        if (p) {
          const flat: Record<string, string> = {
            topic: p.topic || '',
            slug: p.slug || '',
            ai_role: p.ai_role || '',
            user_role: p.user_role || '',
          };
          CEFR_LEVELS.forEach(lvl => {
            const k = lvl.toLowerCase();
            flat[`instruction_${k}`] = p[`instruction_${k}`] || '';
            flat[`ai_prompt_${k}`] = p[`ai_prompt_${k}`] || '';
          });
          setForm(flat);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [qt.slug]);

  useEffect(() => { load(); }, [qt.slug, load]);

  const prompt = data?.prompt;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (prompt?.id) {
        await api.put(`/admin/prompts/${prompt.id}`, form);
        showToast(true, 'Prompt saved');
      } else {
        // Create new prompt with slug matching the exercise type
        await api.post('/admin/prompts', { ...form, slug: qt.slug, topic: form.topic || qt.name || qt.slug });
        showToast(true, 'Prompt created');
      }
      setEditing(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(false, err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    const flat: Record<string, string> = { topic: qt.name || qt.slug, slug: qt.slug, ai_role: '', user_role: '' };
    CEFR_LEVELS.forEach(lvl => {
      const k = lvl.toLowerCase();
      flat[`instruction_${k}`] = '';
      flat[`ai_prompt_${k}`] = '';
    });
    setForm(flat);
    setEditing(true);
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontFamily: 'inherit',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ maxWidth: 680, width: '95%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>AI Prompts</h3>
          {!loading && prompt && !editing && (
            <button onClick={() => setEditing(true)} style={{ ...iconBtnStyle('#f59e0b'), width: 28, height: 28 }} title="Edit prompt">
              <Pencil size={13} />
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem', fontFamily: 'monospace' }}>{qt.slug}</p>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

        {!loading && !prompt && !editing && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p>No AI prompt configured for this exercise type.</p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={startCreate}>
              <Plus size={14} className="inline mr-1" /> Create Prompt
            </button>
          </div>
        )}

        {/* ── View mode ── */}
        {prompt && !editing && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Topic</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{prompt.topic}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slug</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{prompt.slug}</div>
              </div>
            </div>
            {prompt.ai_role && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>AI ROLE: </span>{prompt.ai_role}
              </div>
            )}
            {CEFR_LEVELS.map(lvl => {
              const key = lvl.toLowerCase();
              const inst = prompt[`instruction_${key}`];
              const aiP = prompt[`ai_prompt_${key}`];
              if (!inst && !aiP) return null;
              return (
                <div key={lvl} style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(31,111,235,0.1)', padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{lvl}</div>
                  {inst && <div style={{ padding: '8px 12px', fontSize: 13, borderBottom: aiP ? '1px solid var(--border)' : 'none' }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>INSTRUCTION: </span>{inst}</div>}
                  {aiP && <div style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-wrap' }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>AI PROMPT: </span>{aiP}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Edit / Create mode ── */}
        {editing && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Topic</label>
                <input style={fieldStyle} value={form.topic || ''} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>AI Role</label>
                <input style={fieldStyle} value={form.ai_role || ''} onChange={e => setForm(f => ({ ...f, ai_role: e.target.value }))} placeholder="e.g. French language tutor" />
              </div>
            </div>

            {/* Per-level accordion */}
            {CEFR_LEVELS.map(lvl => {
              const k = lvl.toLowerCase();
              const isOpen = openLevel === lvl;
              return (
                <div key={lvl} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenLevel(isOpen ? '' : lvl)}
                    style={{ width: '100%', background: isOpen ? 'rgba(31,111,235,0.12)' : 'var(--card-bg)', border: 'none', cursor: 'pointer', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{lvl}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '12px' }}>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>User Instruction</label>
                        <textarea
                          rows={2}
                          style={{ ...fieldStyle, resize: 'vertical' }}
                          value={form[`instruction_${k}`] || ''}
                          onChange={e => setForm(f => ({ ...f, [`instruction_${k}`]: e.target.value }))}
                          placeholder={`Instruction shown to user at ${lvl} level`}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>AI System Prompt</label>
                        <textarea
                          rows={5}
                          style={{ ...fieldStyle, resize: 'vertical' }}
                          value={form[`ai_prompt_${k}`] || ''}
                          onChange={e => setForm(f => ({ ...f, [`ai_prompt_${k}`]: e.target.value }))}
                          placeholder={`System prompt sent to AI for ${lvl} evaluation`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); if (!prompt) onClose(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={14} className="inline mr-1" />{saving ? 'Saving...' : 'Save Prompt'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Detailed Preview Modal ────────────────────────────────────────────────
  function AIDetailedPreviewModal({ exercises, onClose }: { exercises: any[]; onClose: () => void }) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '2rem' }}>
        <div className="card" style={{ maxWidth: 1000, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Eye size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0 }}>Detailed Response Preview</h3>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20} /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {exercises.map((ex, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.015)', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
                    <span style={{ background: 'var(--accent)', color: 'white', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                    Exercise ID: {ex.ExerciseID || 'N/A'}
                  </h4>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', width: '25%', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>Key</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>Value (Raw)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ex).filter(([k]) => k !== 'dbStatus').map(([k, v]) => (
                        <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', verticalAlign: 'top', fontFamily: 'monospace', fontSize: 12 }}>{k}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                            {typeof v === 'object' && v !== null ? (
                              <pre style={{ margin: 0, fontSize: 12, background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
                                {JSON.stringify(v, null, 2)}
                              </pre>
                            ) : (
                              <span style={{ opacity: 0.9 }}>{String(v)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border)', textAlign: 'right', background: 'rgba(255,255,255,0.02)' }}>
            <button className="btn btn-secondary" onClick={onClose}>Close Preview</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── AI Generator Modal ──────────────────────────────────────────────────────
  function AIGeneratorModal({ qt, level, category, onClose, showToast }: {
    qt: QuestionType; level: string; category: string; onClose: () => void; showToast: (ok: boolean, msg: string) => void;
  }) {
    const [loading, setLoading] = useState(false);
    const [savingAll, setSavingAll] = useState(false);
    const [exercises, setExercises] = useState<AiExercise[]>([]);
    const [showDetailed, setShowDetailed] = useState(false);
    const [previewExIndex, setPreviewExIndex] = useState<number | null>(null);
    const [lastExtId, setLastExtId] = useState<string | null>(null);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const batchActive = useRef(false);
    const [form, setForm] = useState({
      topic: '',
      grammar: '',
      count: 5,
      custom: '',
      targetLang: 'French',
      langCode: 'FR'
    });

    useEffect(() => {
      api.get('/admin/exercises', {
        params: { type_slug: qt.slug, level: level, page: 1, page_size: 1 }
      })
        .then(res => {
          const total = res.data.total;
          if (total > 0) {
            api.get('/admin/exercises', {
              params: { type_slug: qt.slug, level: level, page: Math.ceil(total / 50), page_size: 50 }
            }).then(res2 => {
              const items = res2.data.items;
              if (items && items.length > 0) {
                const last = items[items.length - 1].external_id;
                setLastExtId(last);
              }
            });
          }
        });
    }, [qt.slug, level]);

    const handleGenerate = async () => {
      if (!form.topic) {
        showToast(false, 'Please provide a topic');
        return;
      }
      
      const BATCH_SIZE = qt.slug === 'translate_bubbles' ? 35 : 10;
      const totalCycles = Math.ceil(form.count / BATCH_SIZE);
      
      setLoading(true);
      batchActive.current = true;
      setBatchProgress({ current: 0, total: totalCycles });
      
      let currentLastExtId = lastExtId;
      
      for (let i = 0; i < totalCycles; i++) {
        if (!batchActive.current) break; // Check for cancellation
        
        const currentCount = Math.min(BATCH_SIZE, form.count - i * BATCH_SIZE);
        setBatchProgress({ current: i + 1, total: totalCycles });
        
        try {
          const res = await api.post('/admin/generate-exercises', null, {
            params: {
              target_lang: form.targetLang,
              lang_code: form.langCode,
              level: level,
              exercise_tag: form.topic,
              vocab_tag: form.topic,
              grammar_tag: form.grammar,
              count: currentCount,
              custom_instructions: form.custom,
              exercise_type: qt.slug,
              last_ext_id: currentLastExtId
            }
          });
          
          const newExs = (res.data.exercises || []).map((ex: Record<string, unknown>) => ({ ...ex, dbStatus: 'ready' }));
          
          setExercises(prev => [...prev, ...newExs]);
          
          if (newExs.length > 0) {
            currentLastExtId = newExs[newExs.length - 1].ExerciseID;
            setLastExtId(currentLastExtId);
          }
          
          showToast(true, `Cycle ${i + 1}/${totalCycles}: Generated ${newExs.length} exercises`);
        } catch (e: unknown) {
          const err = e as { response?: { data?: { detail?: string } } };
          showToast(false, `Cycle ${i + 1} failed: ${err.response?.data?.detail || 'Generation failed'}`);
          if (i === 0) break; // if first cycle fails completely, stop
        }
      }
      
      setLoading(false);
      batchActive.current = false;
      setBatchProgress({ current: 0, total: 0 });
    };

    const stopBatch = () => {
      batchActive.current = false;
      setLoading(false);
      showToast(true, 'Batch generation stopped.');
    };

    const exportToCSV = () => {
      if (exercises.length === 0) return;
      const headers = Object.keys(exercises[0]).filter(k => k !== 'dbStatus');
      const csvContent = [
        headers.join(','),
        ...exercises.map(ex => 
          headers.map(h => {
            let val = ex[h];
            if (Array.isArray(val)) val = val.join('+');
            if (val === null || val === undefined) val = "";
            const strVal = String(val).replace(/"/g, '""');
            return `"${strVal}"`;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `ai_generated_${qt.slug}_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const saveToDB = async (index: number) => {
      const ex = exercises[index];
      const newExs = [...exercises];
      newExs[index].dbStatus = 'saving';
      setExercises(newExs);

      try {
        // Dynamically build CSV from AI response keys
        const headers = Object.keys(ex).filter(k => k !== 'dbStatus');
        const values = headers.map(h => {
          const val = ex[h];
          if (Array.isArray(val)) return val.join('+');
          return val ?? "";
        });

        const csvContent = headers.join(',') + '\n' + values.map(v => `"${v}"`).join(',');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', blob, 'exercise.csv');
        formData.append('skill', category);
        formData.append('type_slug', qt.slug);
        formData.append('category', 'main');

        await api.post('/admin/sync/exercises', formData);

        const finalExs = [...exercises];
        finalExs[index].dbStatus = 'saved';
        setExercises(finalExs);
      } catch (e: unknown) {
        const finalExs = [...exercises];
        finalExs[index].dbStatus = 'error';
        setExercises(finalExs);
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Save failed');
      }
    };

    const saveAll = async () => {
      const unsavedIndices = exercises.map((ex, i) => ex.dbStatus !== 'saved' ? i : -1).filter(i => i !== -1);
      if (unsavedIndices.length === 0) {
        showToast(true, 'Nothing to save');
        return;
      }

      setSavingAll(true);
      
      setExercises(prev => {
        const next = [...prev];
        unsavedIndices.forEach(i => next[i].dbStatus = 'saving');
        return next;
      });

      try {
        const headers = Object.keys(exercises[unsavedIndices[0]]).filter(k => k !== 'dbStatus');
        
        const csvRows = [headers.join(',')];
        unsavedIndices.forEach(i => {
          const ex = exercises[i];
          const rowValues = headers.map(h => {
            let val = ex[h];
            if (Array.isArray(val)) val = val.join('+');
            if (val === null || val === undefined) val = "";
            const strVal = String(val).replace(/"/g, '""');
            return `"${strVal}"`;
          });
          csvRows.push(rowValues.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const formData = new FormData();
        formData.append('file', blob, 'bulk_exercises.csv');
        formData.append('skill', category);
        formData.append('type_slug', qt.slug);
        formData.append('category', 'main');

        await api.post('/admin/sync/exercises', formData);

        setExercises(prev => {
          const next = [...prev];
          unsavedIndices.forEach(i => next[i].dbStatus = 'saved');
          return next;
        });
        showToast(true, `Successfully bulk saved ${unsavedIndices.length} exercises to the database.`);
      } catch (e: unknown) {
        setExercises(prev => {
          const next = [...prev];
          unsavedIndices.forEach(i => next[i].dbStatus = 'error');
          return next;
        });
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Bulk save failed');
      } finally {
        setSavingAll(false);
      }
    };

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
        <div className="card" style={{ maxWidth: 1000, width: '95%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
            <Sparkles size={24} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0 }}>AI Exercise Generator</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Topic / Theme</label>
              <input className="form-control" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Professional communication" />
            </div>
            <div className="form-group">
              <label className="form-label">Grammar Focus (Optional)</label>
              <input className="form-control" value={form.grammar} onChange={e => setForm({ ...form, grammar: e.target.value })} placeholder="e.g. Subjunctive" />
            </div>
            <div className="form-group">
              <label className="form-label">Count (Total)</label>
              <input type="number" className="form-control" value={form.count} onChange={e => setForm({ ...form, count: parseInt(e.target.value) || 1 })} min={1} max={1000} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: '2rem', alignItems: 'center' }}>
            {!loading ? (
              <button className="btn btn-primary" onClick={handleGenerate}>
                Generate Exercises
              </button>
            ) : (
              <button className="btn btn-primary" onClick={stopBatch} style={{ background: '#ef4444' }}>
                Stop Batch ({batchProgress.current}/{batchProgress.total})
              </button>
            )}
            {exercises.length > 0 && (
              <>
                <button className="btn btn-secondary" onClick={() => { setPreviewExIndex(null); setShowDetailed(true); }} style={{ background: 'rgba(31,111,235,0.15)', color: 'var(--accent)', border: '1px solid rgba(31,111,235,0.3)' }}>
                  <Eye size={18} className="inline mr-1" /> Detailed Preview
                </button>
                <button className="btn btn-secondary" onClick={saveAll} disabled={savingAll}>
                  {savingAll ? 'Saving...' : 'Save All to DB'}
                </button>
                <button className="btn btn-secondary" onClick={exportToCSV} style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <Download size={18} className="inline mr-1" /> Export CSV
                </button>
              </>
            )}
          </div>

          {exercises.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>ID</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Content Preview</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {exercises.map((ex, i) => {
                    // Find a good preview field (first one that looks like content)
                    const previewKey = Object.keys(ex).find(k => {
                      const lk = k.toLowerCase();
                      if (lk.includes('type') || lk.includes('id') || lk.includes('tag') || lk.includes('level') || lk.includes('dbstatus')) return false;
                      return lk.includes('sentence') || lk.includes('text') || lk.includes('paragraph') || lk.includes('passage') || lk.includes('prompt') || lk.includes('question') || lk.includes('pairs') || lk.includes('mapping');
                    }) || Object.keys(ex).find(k => !['dbstatus', 'id', 'external_id', 'exerciseid'].includes(k.toLowerCase()));
                    const preview = previewKey ? String(ex[previewKey]).substring(0, 100) + (String(ex[previewKey]).length > 100 ? '...' : '') : 'No preview';

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px', fontFamily: 'monospace' }}>{ex.ExerciseID}</td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)' }}>{previewKey || 'Content'}</div>
                          <div>{preview}</div>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {ex.dbStatus === 'saving' && <span style={{ color: 'var(--accent)' }}>Saving...</span>}
                          {ex.dbStatus === 'saved' && <Check size={16} style={{ color: '#10b981', margin: '0 auto' }} />}
                          {ex.dbStatus === 'error' && <span style={{ color: '#ef4444' }}>Error</span>}
                          {ex.dbStatus === 'ready' && <span style={{ color: 'var(--text-muted)' }}>Ready</span>}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button title="View Details" onClick={() => { setPreviewExIndex(i); setShowDetailed(true); }}
                              style={{ ...iconBtnStyle('var(--accent)'), width: 28, height: 28 }}>
                              <Eye size={14} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12, height: 28 }}
                              onClick={() => saveToDB(i)} disabled={ex.dbStatus === 'saving' || ex.dbStatus === 'saved'}>
                              {ex.dbStatus === 'saved' ? 'Saved' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {showDetailed && (
            <AIDetailedPreviewModal
              exercises={previewExIndex !== null ? [exercises[previewExIndex]] : exercises}
              onClose={() => setShowDetailed(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Slide 1: Main Practice ───────────────────────────────────────────────────
  function Slide1Main({
    level, setLevel, category, setCategory, questionTypes, setQuestionTypes, onEdit, onAiGenerate, showToast,
  }: {
    level: CefrLevel; setLevel: (l: CefrLevel) => void;
    category: Category; setCategory: (c: Category) => void;
    questionTypes: QuestionType[];
    setQuestionTypes: React.Dispatch<React.SetStateAction<QuestionType[]>>;
    onEdit: (qt: QuestionType) => void;
    onAiGenerate: (qt: QuestionType) => void;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    // Fetch available slugs — kept for potential future use but not used for filtering in admin
    const [slugsLoading, setSlugsLoading] = useState(false);

    // Modal state
    const [analyticsQt, setAnalyticsQt] = useState<QuestionType | null>(null);
    const [promptsQt, setPromptsQt] = useState<QuestionType | null>(null);
    const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

    const handleToggleActive = async (qt: QuestionType) => {
      setTogglingSlug(qt.slug);
      try {
        const r = await api.post(`/admin/question-types/${qt.slug}/toggle-active`);
        // Use the is_active value returned by the backend
        setQuestionTypes(prev => prev.map(q => q.slug === qt.slug ? { ...q, is_active: r.data.is_active } : q));
      } catch {
        // silently fail — toast is in parent
      } finally {
        setTogglingSlug(null);
      }
    };

    useEffect(() => {
      setSlugsLoading(true);
      api.get('/tag-topics/available-types', { params: { level: level.toLowerCase(), language: 'fr' } })
        .finally(() => setSlugsLoading(false));
    }, [level]);

    // Filter: must be in this category's slug list
    // Note: we do NOT filter by availableSlugs here — that's for the student practice page.
    // The admin panel should show all configured exercise types so admins can upload content.
    // Merge DB types with SKILL_SLUGS so types not yet in DB still appear.
    const dbSlugs = new Set(questionTypes.map(qt => qt.slug));
    const allSlugsForCategory = SKILL_SLUGS[category] || [];
    const mergedTypes: QuestionType[] = [
      // DB types that are in this category
      ...questionTypes.filter(qt => allSlugsForCategory.includes(qt.slug)),
      // Slugs in SKILL_SLUGS but not yet in DB — show as placeholder
      ...allSlugsForCategory
        .filter(slug => !dbSlugs.has(slug))
        .map(slug => ({ slug, name: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), is_active: true })),
    ];
    const visibleTypes = mergedTypes;

    return (
      <div>
        {/* Filters row */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 80 }}>CEFR Level</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {CEFR_LEVELS.map(l => (
                <button key={l} onClick={() => setLevel(l)}
                  style={{
                    padding: '6px 18px', borderRadius: 8, border: '1px solid var(--border)',
                    background: level === l ? 'var(--primary)' : 'var(--card-bg)',
                    color: level === l ? '#fff' : 'var(--text)', cursor: 'pointer',
                    fontWeight: level === l ? 700 : 400, fontSize: 14, transition: 'all 0.15s',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 80 }}>Category</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  style={{
                    padding: '6px 18px', borderRadius: 8, border: '1px solid var(--border)',
                    background: category === c ? 'var(--accent)' : 'var(--card-bg)',
                    color: category === c ? '#fff' : 'var(--text)', cursor: 'pointer',
                    fontWeight: category === c ? 700 : 400, fontSize: 14, transition: 'all 0.15s',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Practice Exercises table */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>Practice Exercises</h2>
          {slugsLoading && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</span>}
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: slugsLoading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 60 }}>Sl No</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Exercise</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Main Type - slug</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTypes.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No exercise types found for {category}.</td></tr>
              ) : (
                visibleTypes.map((qt, idx) => (
                  <tr key={qt.slug} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', opacity: qt.is_active ? 1 : 0.45 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {qt.name || qt.slug}
                      {!qt.is_active && (
                        <span style={{ marginLeft: 8, fontSize: 11, background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                          DEACTIVATED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>
                      {level}_{qt.slug}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {/* Analytics */}
                        <button title="Analytics" onClick={() => setAnalyticsQt(qt)} style={iconBtnStyle('#1f6feb')}>
                          <BarChart3 size={15} />
                        </button>
                        {/* AI Prompts */}
                        <button title="AI Prompts" onClick={() => setPromptsQt(qt)} style={iconBtnStyle('#2ea043')}>
                          <MessageSquare size={15} />
                        </button>
                        {/* AI Generator */}
                        <button title="AI Generate" onClick={() => onAiGenerate(qt)} style={iconBtnStyle('#a855f7')}>
                          <Sparkles size={15} />
                        </button>
                        {/* Edit - opens Slide 2 */}
                        <button title="Edit subtypes" onClick={() => onEdit(qt)} style={iconBtnStyle('#f59e0b')}>
                          <Pencil size={15} />
                        </button>
                        {/* Activate / Deactivate */}
                        <button
                          title={qt.is_active ? 'Deactivate (hides from practice page)' : 'Activate (shows on practice page)'}
                          onClick={() => handleToggleActive(qt)}
                          disabled={togglingSlug === qt.slug}
                          style={{
                            ...iconBtnStyle(qt.is_active ? '#ef4444' : '#2ea043'),
                            opacity: togglingSlug === qt.slug ? 0.5 : 1,
                          }}>
                          <Power size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modals */}
        {analyticsQt && <AnalyticsModal qt={analyticsQt} onClose={() => setAnalyticsQt(null)} />}
        {promptsQt && <PromptsModal qt={promptsQt} onClose={() => setPromptsQt(null)} showToast={showToast} />}
      </div>
    );
  }

  function iconBtnStyle(color: string): React.CSSProperties {
    return {
      width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
      background: `${color}22`, color: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    };
  }

  // ─── Write Image Upload Panel ─────────────────────────────────────────────────
  function WriteImageUploadPanel({
    exerciseType, level, showToast,
  }: {
    exerciseType: QuestionType; level: CefrLevel;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    const [exercises, setExercises] = useState<ExerciseRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null); // exerciseId being uploaded
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingExId = useRef<string | null>(null);

    const loadExercises = async () => {
      setLoading(true);
      try {
        const r = await api.get('/admin/exercises', {
          params: { type_slug: exerciseType.slug, level, page: 1, page_size: 50 }
        });
        setExercises(r.data.items || []);
      } catch {
        setExercises([]);
      } finally {
        setLoading(false);
      }
    };

    const handleUploadClick = (exId: string) => {
      pendingExId.current = exId;
      fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const exId = pendingExId.current;
      if (!file || !exId) return;
      e.target.value = '';

      setUploading(exId);
      try {
        // 1. Upload to Cloudinary
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await api.post('/admin/upload-image', fd);
        const imageUrl = uploadRes.data.url;

        // 2. Patch the exercise content with the new image URL
        await api.patch(`/admin/exercises/${exId}/image-url`, { image_url: imageUrl });

        // 3. Update local state
        setExercises(prev => prev.map(ex =>
          ex.external_id === exId ? { ...ex, image_url: imageUrl } : ex
        ));
        showToast(true, `Image uploaded for ${exId}`);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Upload failed');
      } finally {
        setUploading(null);
        pendingExId.current = null;
      }
    };

    return (
      <div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Upload images for each exercise. Images are stored on Cloudinary.
          </p>
          <button className="btn btn-secondary" style={{ fontSize: 13, padding: '5px 12px' }} onClick={loadExercises} disabled={loading}>
            {loading ? 'Loading…' : 'Load Exercises'}
          </button>
        </div>

        {exercises.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>ID</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Current Image</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map(ex => {
                  const imgUrl = ex.image_url || ex.content?.image_url || '';
                  const isUploading = uploading === ex.external_id;
                  return (
                    <tr key={ex.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{ex.external_id}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {imgUrl ? (
                          <img src={imgUrl} alt="" style={{ height: 48, width: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No image</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px', opacity: isUploading ? 0.6 : 1 }}
                          onClick={() => handleUploadClick(ex.external_id)}
                          disabled={isUploading}
                        >
                          <CloudUpload size={13} style={{ display: 'inline', marginRight: 4 }} />
                          {isUploading ? 'Uploading…' : imgUrl ? 'Replace' : 'Upload'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );
}



  // ─── Direct CSV Upload (for exercise types like correct_spelling) ─────────────
  function DirectCsvUpload({
    exerciseType, category, showToast,
  }: {
    exerciseType: QuestionType; category: Category;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

    const handleFile = async (file: File) => {
      setUploading(true);
      setProgress(null);
      try {
        // Send the whole file in one request — avoids splitting quoted multi-line cells
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('skill', category);
        fd.append('type_slug', exerciseType.slug);
        fd.append('category', 'main');
        setProgress({ current: 0, total: 1 });
        const result = await api.post('/admin/sync/exercises', fd);
        const count = result.data?.message?.match(/\d+/)?.[0] ?? '?';
        setProgress({ current: 1, total: 1 });
        showToast(true, `Uploaded ${count} exercises`);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Upload failed');
      } finally {
        setUploading(false);
        setProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px', opacity: uploading ? 0.7 : 1 }}
          title="Upload Fix the Spelling CSV"
        >
          <CloudUpload size={15} />
          {uploading
            ? progress
              ? `${progress.current}/${progress.total}`
              : 'Uploading…'
            : 'Upload CSV'}
        </button>
      </>
    );
  }

  // ─── Slide 2: Subtypes List ───────────────────────────────────────────────────
  function Slide2Subtypes({
    level, category, exerciseType,
    onBack, onView, onCreate, onAiGenerate,
    showToast,
  }: {
    level: CefrLevel; category: Category; exerciseType: QuestionType;
    onBack: () => void; onView: (sub: ExerciseSubtype) => void; onCreate: () => void; onAiGenerate: (qt: QuestionType) => void;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    const [subtypes, setSubtypes] = useState<ExerciseSubtype[]>([]);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState<ExerciseSubtype | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const r = await api.get('/admin/exercise-subtypes', {
          params: { type_slug: exerciseType.slug, level, skill: category }
        });
        setSubtypes(r.data.items || []);
      } catch {
        // If endpoint doesn't exist yet, show empty state
        setSubtypes([]);
      } finally {
        setLoading(false);
      }
    }, [exerciseType.slug, level, category]);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async () => {
      if (!confirmDelete) return;
      setDeleteLoading(true);
      try {
        await api.delete(`/admin/exercise-subtypes/${confirmDelete.id}`);
        showToast(true, `Deleted "${confirmDelete.name_en}"`);
        setSubtypes(prev => prev.filter(s => s.id !== confirmDelete.id));
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Delete failed');
      } finally {
        setDeleteLoading(false);
        setConfirmDelete(null);
      }
    };

    const handleToggleActive = async (sub: ExerciseSubtype) => {
      try {
        const r = await api.patch(`/admin/exercise-subtypes/${sub.id}/toggle-active`);
        setSubtypes(prev => prev.map(s => s.id === sub.id ? { ...s, is_active: r.data.is_active } : s));
        showToast(true, `${sub.is_active ? 'Deactivated' : 'Activated'} "${sub.name_en}"`);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        showToast(false, err.response?.data?.detail || 'Update failed');
      }
    };

    return (
      <div>
        {/* Breadcrumb header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.5rem' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            CEFR Level: <strong style={{ color: 'var(--white)' }}>{level}</strong>
            &nbsp;&nbsp;Category: <strong style={{ color: 'var(--white)' }}>{category}</strong>
          </span>
        </div>



        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{exerciseType.name || exerciseType.slug}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Direct CSV upload — shown for exercise types that don't need subtypes */}
            {(exerciseType.slug === 'correct_spelling' || exerciseType.slug === 'write_fill_blanks' || exerciseType.slug === 'write_topic' || exerciseType.slug === 'write_image' || exerciseType.slug === 'summarise_audio' || exerciseType.slug === 'write_interactive' || exerciseType.slug === 'speak_interactive' || exerciseType.slug === 'writing_conversation' || exerciseType.slug === 'speaking_conversation') && (
              <DirectCsvUpload
                exerciseType={exerciseType}
                category={category}
                showToast={showToast}
              />
            )}
            <button onClick={() => onAiGenerate(exerciseType)} title="AI Generate exercises"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9 }}>
              <Sparkles size={18} />
            </button>
            <button onClick={onCreate} title="Create new subtype"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 60 }}>Sl No</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Exercise</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Identifier</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>SubType - slug</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
              ) : subtypes.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No subtypes yet. Click <strong>+</strong> to create one.
                </td></tr>
              ) : (
                subtypes.map((sub, idx) => (
                  <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)', opacity: sub.is_active ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sub.name_en}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>
                      {sub.identifier_start} – {sub.identifier_end}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>
                      <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{sub.subtype_slug}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button title="View exercises" onClick={() => onView(sub)} style={iconBtnStyle('#60a5fa')}>
                          <Eye size={15} />
                        </button>
                        <button title={sub.is_active ? 'Deactivate' : 'Activate'} onClick={() => handleToggleActive(sub)}
                          style={iconBtnStyle(sub.is_active ? '#ef4444' : '#2ea043')}>
                          <Power size={15} />
                        </button>
                        <button title="Delete" onClick={() => setConfirmDelete(sub)} style={iconBtnStyle('#ef4444')}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {confirmDelete && (
          <ConfirmModal
            title="Delete Subtype"
            body={`Delete "${confirmDelete.name_en}"? This will also remove all associated exercises. This cannot be undone.`}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(null)}
            loading={deleteLoading}
          />
        )}

        {/* Image upload panel for write_image */}
        {exerciseType.slug === 'write_image' && (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: 16 }}>Image Management</h3>
            <WriteImageUploadPanel
              exerciseType={exerciseType}
              level={level}
              showToast={showToast}
            />
          </div>
        )}
      </div>
    );
  }

  // ─── Slide 3: Exercise List (View) ────────────────────────────────────────────
  // ─── View/Edit Modal ──────────────────────────────────────────────────────────
  function ViewEditModal({ externalId, onClose, onSaved }: { externalId: string; onClose: () => void; onSaved: () => void }) {
    const [row, setRow] = useState<ExcelRow | null>(null);
    const [originalRow, setOriginalRow] = useState<ExcelRow | null>(null);
    const [typeSlug, setTypeSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const load = useCallback(async () => {
      if (!externalId.trim()) return;
      setLoading(true); setError(''); setRow(null); setSaved(false); setIsDirty(false);
      try {
        const r = await api.get(`/admin/exercises/${externalId.trim()}/excel-row`);
        setRow(r.data.row);
        setOriginalRow(r.data.row);
        setTypeSlug(r.data.type_slug || '');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setError(err.response?.data?.detail || 'Failed to load');
      } finally { setLoading(false); }
    }, [externalId]);

    useEffect(() => { load(); }, [load]);

    const handleChange = (key: string, value: string) => {
      setRow(prev => prev ? { ...prev, [key]: value } : prev);
      setSaved(false);
      setIsDirty(true);
    };

    const handleSave = async () => {
      if (!row) return;
      setSaving(true); setError('');
      try {
        await api.put(`/admin/exercises/${externalId.trim()}/excel-row`, { row });
        setOriginalRow(row);
        setSaved(true);
        setIsDirty(false);
        setIsEditMode(false);
        onSaved();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setError(err.response?.data?.detail || 'Save failed');
      } finally { setSaving(false); }
    };

    const handleCloseRequest = () => {
      if (isEditMode && isDirty) {
        setShowUnsavedWarning(true);
      } else {
        onClose();
      }
    };

    const handleDiscardAndClose = () => {
      setRow(originalRow);
      setIsDirty(false);
      setIsEditMode(false);
      onClose();
    };

    const META_KEYS = ['ExerciseID', 'Level', 'Category', 'QuestionType', 'Difficulty', 'Exercise Tag', 'TimeLimitSeconds'];
    const INST_KEYS = ['Instruction_EN', 'Instruction_FR'];
    const metaEntries = row ? META_KEYS.filter(k => k in row) : [];
    const instEntries = row ? INST_KEYS.filter(k => k in row) : [];
    const otherEntries = row ? Object.keys(row).filter(k => !META_KEYS.includes(k) && !INST_KEYS.includes(k)) : [];

    const renderField = (key: string) => {
      const val = String(row![key] ?? '');
      const isLong = val.length > 80 || key.toLowerCase().includes('paragraph') || key.toLowerCase().includes('passage');
      return (
        <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
          <td style={{ padding: '8px 12px', fontWeight: 500, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: 220 }}>{key}</td>
          <td style={{ padding: '6px 8px' }}>
            {isEditMode ? (
              isLong ? (
                <textarea value={val} onChange={e => handleChange(key, e.target.value)} rows={3}
                  style={{ width: '100%', resize: 'vertical', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontFamily: 'inherit' }} />
              ) : (
                <input type="text" value={val} onChange={e => handleChange(key, e.target.value)}
                  style={{ width: '100%', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)' }} />
              )
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text)', display: 'block', padding: '5px 8px', wordBreak: 'break-word' }}>{val || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}</span>
            )}
          </td>
        </tr>
      );
    };

    const SectionHeader = ({ label }: { label: string }) => (
      <tr><td colSpan={2} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', background: 'rgba(255,255,255,0.02)' }}>{label}</td></tr>
    );

    return (
      <>
        {/* Backdrop */}
        <div onClick={handleCloseRequest}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />

        {/* Modal */}
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 1001, width: 'min(780px, 95vw)', maxHeight: '88vh',
          background: 'var(--card-bg)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>{externalId}</span>
              {typeSlug && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typeSlug}</span>}
              {/* VIEW / EDIT MODE badge */}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: isEditMode ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.12)',
                color: isEditMode ? '#f59e0b' : '#60a5fa',
                border: `1px solid ${isEditMode ? 'rgba(245,158,11,0.35)' : 'rgba(96,165,250,0.3)'}`,
                letterSpacing: '0.05em',
              }}>
                {isEditMode ? '✏️ EDIT MODE' : '👁 VIEW MODE'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {saved && !isEditMode && (
                <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={14} />Saved
                </span>
              )}
              {!isEditMode && (
                <button onClick={load} title="Reload"
                  style={{ padding: '5px 12px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>
                  Reload
                </button>
              )}
              {isEditMode ? (
                <button className="btn btn-primary" style={{ padding: '5px 14px', fontSize: 13 }} onClick={handleSave} disabled={saving}>
                  <Save size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <button onClick={() => setIsEditMode(true)}
                  style={{ padding: '5px 14px', fontSize: 13, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={handleCloseRequest}
                style={{ width: 30, height: 30, borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body — scrollable */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 16px' }}>
            {loading && <p style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Loading...</p>}
            {error && <div style={{ margin: '1rem', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontSize: 13 }}><AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />{error}</div>}
            {row && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {metaEntries.length > 0 && <><SectionHeader label="Metadata" />{metaEntries.map(renderField)}</>}
                  {instEntries.length > 0 && <><SectionHeader label="Instructions" />{instEntries.map(renderField)}</>}
                  {otherEntries.length > 0 && <><SectionHeader label="Content" />{otherEntries.map(renderField)}</>}
                </tbody>
              </table>
            )}
          </div>

          {/* Edit mode bottom bar */}
          {isEditMode && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.05)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              <button onClick={() => { setRow(originalRow); setIsDirty(false); setIsEditMode(false); }}
                style={{ padding: '6px 14px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: 13 }} onClick={handleSave} disabled={saving}>
                <Save size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Unsaved changes warning */}
        {showUnsavedWarning && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.4)' }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              zIndex: 1101, background: 'var(--card-bg)', borderRadius: 10, padding: '24px 28px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)', border: '1px solid var(--border)',
              width: 'min(400px, 90vw)', textAlign: 'center',
            }}>
              <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Unsaved Changes</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>You have unsaved edits. Save before closing?</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={handleDiscardAndClose}
                  style={{ padding: '7px 16px', fontSize: 13, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', cursor: 'pointer' }}>
                  Discard & Close
                </button>
                <button onClick={() => setShowUnsavedWarning(false)}
                  style={{ padding: '7px 16px', fontSize: 13, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer' }}>
                  Keep Editing
                </button>
                <button className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 13 }} onClick={async () => { setShowUnsavedWarning(false); await handleSave(); }}>
                  Save & Close
                </button>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // ─── ExcelRowEditor (used in Detail/Search tab — keeps edit-always mode there) ─
  function ExcelRowEditor({ externalId, onSaved }: { externalId: string; onSaved: () => void }) {
    const [row, setRow] = useState<ExcelRow | null>(null);
    const [typeSlug, setTypeSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    const load = useCallback(async () => {
      if (!externalId.trim()) return;
      setLoading(true); setError(''); setRow(null); setSaved(false);
      try {
        const r = await api.get(`/admin/exercises/${externalId.trim()}/excel-row`);
        setRow(r.data.row); setTypeSlug(r.data.type_slug || '');
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setError(err.response?.data?.detail || 'Failed to load');
      }
      finally { setLoading(false); }
    }, [externalId]);

    useEffect(() => { load(); }, [load]);

    const handleChange = (key: string, value: string) => {
      setRow(prev => prev ? { ...prev, [key]: value } : prev); setSaved(false);
    };

    const handleSave = async () => {
      if (!row) return;
      setSaving(true); setError('');
      try {
        await api.put(`/admin/exercises/${externalId.trim()}/excel-row`, { row });
        setSaved(true); onSaved();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setError(err.response?.data?.detail || 'Save failed');
      }
      finally { setSaving(false); }
    };

    if (loading) return <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>Loading row data...</p>;
    if (error) return <div className="alert alert-error"><AlertCircle size={16} className="inline mr-2" />{error}</div>;
    if (!row) return null;

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
          <td style={{ padding: '8px 12px', fontWeight: 500, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: 220 }}>{key}</td>
          <td style={{ padding: '6px 8px' }}>
            {isLong ? (
              <textarea value={val} onChange={e => handleChange(key, e.target.value)} rows={3}
                style={{ width: '100%', resize: 'vertical', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontFamily: 'inherit' }} />
            ) : (
              <input type="text" value={val} onChange={e => handleChange(key, e.target.value)}
                style={{ width: '100%', fontSize: 13, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)' }} />
            )}
          </td>
        </tr>
      );
    };

    const SectionHeader = ({ label }: { label: string }) => (
      <tr><td colSpan={2} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', background: 'var(--card-bg)' }}>{label}</td></tr>
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
            <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 13 }} onClick={load}>Reload</button>
            <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 13 }} onClick={handleSave} disabled={saving}>
              <Save size={14} className="inline mr-1" />{saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
        {error && <div className="alert alert-error mb-8"><AlertCircle size={16} className="inline mr-2" />{error}</div>}
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

  function Slide3Exercises({
    level, category, exerciseType, subtype,
    onBack, onAiGenerate, showToast,
  }: {
    level: CefrLevel; category: Category; exerciseType: QuestionType; subtype: ExerciseSubtype;
    onBack: () => void;
    onAiGenerate: (qt: QuestionType) => void;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    type ExTab = 'list' | 'detail';
    const [tab, setTab] = useState<ExTab>('list');
    const [exercises, setExercises] = useState<ExerciseRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const [loading, setLoading] = useState(true);
    const [showDeactivatedOnly, setShowDeactivatedOnly] = useState(false);
    // viewingId: which row's modal is open (null = none)
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<ExerciseRow | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [searchId, setSearchId] = useState('');
    const [detailId, setDetailId] = useState('');

    const load = useCallback(async (p = 1) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: p, page_size: pageSize,
          type_slug: exerciseType.slug,
          level,
        };
        const r = await api.get('/admin/exercises', { params });
        const allItems: ExerciseRow[] = r.data.items || [];
        const items = showDeactivatedOnly
          ? allItems.filter((e: ExerciseRow) => e.is_active === false)
          : allItems;
        setExercises(items);
        setTotal(r.data.total || allItems.length);
        setPage(p);
      } catch {
        setExercises([]);
      } finally {
        setLoading(false);
      }
    }, [exerciseType.slug, level, showDeactivatedOnly]);

    useEffect(() => { load(1); }, [load]);

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
      } finally {
        setDeleteLoading(false);
        setConfirmDelete(null);
      }
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

    const handleDownloadCSV = async () => {
      try {
        const r = await api.get('/admin/exercises/export', {
          params: { type_slug: exerciseType.slug, level },
          responseType: 'blob',
        });
        const url = URL.createObjectURL(r.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exerciseType.slug}_${level}_${subtype.subtype_slug}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        showToast(false, 'Export not available yet');
      }
    };

    const totalPages = Math.ceil(total / pageSize);
    const subtypeIndex = 1; // placeholder — would come from the subtype list position

    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.25rem' }}>
          <button onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            CEFR Level: <strong style={{ color: 'var(--white)' }}>{level}</strong>
            &nbsp;&nbsp;Category: <strong style={{ color: 'var(--white)' }}>{category}</strong>
          </span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>
            {exerciseType.name || exerciseType.slug} &gt;&gt; {subtypeIndex}. {subtype.name_en}
          </h2>
          {/* Download CSV — green, top right */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => onAiGenerate(exerciseType)} title="AI Generate more"
              style={{
                width: 38, height: 38, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
              <Sparkles size={18} />
            </button>
            <button onClick={handleDownloadCSV} title="Download CSV"
              style={{
                width: 38, height: 38, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#2ea043', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
              <Download size={18} />
            </button>
          </div>
        </div>

        {/* Tabs + deactivated toggle on same row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {(['list', 'detail'] as ExTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '8px 24px', background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === t ? 'var(--white)' : 'var(--text-muted)',
                  borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: tab === t ? 600 : 500, fontSize: 14, transition: 'all 0.15s',
                }}>
                {t === 'list' ? 'Exercise List' : 'Detail / Search'}
              </button>
            ))}
          </div>
          {/* Show deactivated toggle — top right of tabs */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', paddingBottom: 8 }}>
            <input type="checkbox" checked={showDeactivatedOnly} onChange={e => setShowDeactivatedOnly(e.target.checked)} />
            Show deactivated only
          </label>
        </div>

        {/* ── EXERCISE LIST TAB ── */}
        {tab === 'list' && (
          <>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : exercises.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <p>No exercises found{showDeactivatedOnly ? ' (deactivated)' : ''}.</p>
              </div>
            ) : (
              <>
                {/* Outer wrapper with horizontal scroll on the right */}
                <div style={{ display: 'flex', gap: 0 }}>
                  <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', minWidth: 600 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--border)' }}>
                            {/* Actions col on LEFT per design */}
                            <th style={{ padding: '10px 14px', width: 130 }}></th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'underline' }}>ExID</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>Question Type</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', width: 80 }}>Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exercises.map(ex => (
                            <>
                              <tr key={ex.id}
                                style={{ borderBottom: '1px solid var(--border)', opacity: ex.is_active === false ? 0.45 : 1 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                {/* Actions — LEFT side, matching design */}
                                <td style={{ padding: '9px 14px' }}>
                                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                    {/* View button */}
                                    <button
                                      title="View"
                                      onClick={() => setViewingId(ex.external_id)}
                                      style={iconBtnStyle('#60a5fa')}>
                                      <Eye size={13} />
                                    </button>
                                    {/* Delete */}
                                    <button title="Delete" onClick={() => setConfirmDelete(ex)} style={iconBtnStyle('#ef4444')}>
                                      <Trash2 size={13} />
                                    </button>
                                    {/* Deactivate */}
                                    <button
                                      title={ex.is_active === false ? 'Activate' : 'Deactivate'}
                                      onClick={() => handleToggleActive(ex)}
                                      style={iconBtnStyle(ex.is_active === false ? '#2ea043' : '#ef4444')}>
                                      <Power size={13} />
                                    </button>
                                    {/* Image upload — only shown for image-based exercise types */}
                                    {['image_mcq', 'image_labelling', 'diagram_mapping', 'match_desc_to_image'].includes(exerciseType.slug) && (
                                      <button title="Upload image" style={iconBtnStyle('#f87171')}>
                                        <Upload size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{ex.external_id}</td>
                                <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{ex.type_slug ?? '—'}</td>
                                <td style={{ padding: '9px 14px' }}>{ex.level ?? '—'}</td>
                              </tr>
                              {/* View/Edit Modal — rendered outside table via portal-like pattern */}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* View/Edit Modals — outside table to avoid invalid HTML */}
                {exercises.map(ex => viewingId === ex.external_id && (
                  <ViewEditModal
                    key={ex.external_id}
                    externalId={ex.external_id}
                    onClose={() => setViewingId(null)}
                    onSaved={() => {
                      showToast(true, `Saved ${ex.external_id}`);
                      load(page);
                    }}
                  />
                ))}

                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
                    <button className="btn btn-secondary" disabled={page <= 1} onClick={() => load(page - 1)} style={{ padding: '6px 12px' }}>Prev</button>
                    <span style={{ fontSize: 13 }}>Page {page} / {totalPages}</span>
                    <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => load(page + 1)} style={{ padding: '6px 12px' }}>Next</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── DETAIL / SEARCH TAB ── */}
        {tab === 'detail' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
              <input className="form-control" placeholder="Enter Exercise ID (e.g. HTS001)..."
                value={searchId}
                onChange={e => setSearchId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setDetailId(searchId)}
                style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={() => setDetailId(searchId)} disabled={!searchId.trim()}>
                Load
              </button>
            </div>
            {detailId && (
              <ExcelRowEditor
                key={detailId}
                externalId={detailId}
                onSaved={() => showToast(true, `Saved ${detailId}`)}
              />
            )}
          </div>
        )}

        {/* Delete confirm modal */}
        {confirmDelete && (
          <ConfirmModal
            title="Delete Exercise"
            body={`Delete exercise "${confirmDelete.external_id}"? This cannot be undone.`}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(null)}
            loading={deleteLoading}
          />
        )}
      </div>
    );
  }

  // ─── Slide 4: Create Subtype ──────────────────────────────────────────────────
  function Slide4Create({
    level, category, exerciseType,
    onBack, onCreated, showToast,
  }: {
    level: CefrLevel; category: Category; exerciseType: QuestionType;
    onBack: () => void; onCreated: () => void;
    showToast: (ok: boolean, msg: string) => void;
  }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState({
      name_en: '', name_fr: '', name_de: '', name_es: '',
      identifier_name: '', subtype_slug: '',
    });
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number } | null>(null);

    // Auto-generate subtype slug from exercise code + English name
    useEffect(() => {
      if (form.name_en && form.identifier_name) {
        const slug = `${form.identifier_name}_${form.name_en}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        setForm(f => ({ ...f, subtype_slug: slug }));
      }
    }, [form.name_en, form.identifier_name]);

    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
      if (!form.name_en.trim()) { setError('English name is required'); return; }
      if (!form.identifier_name.trim()) { setError('Identifier name is required'); return; }
      setSaving(true); setError('');
      try {
        const payload = {
          ...form,
          type_slug: exerciseType.slug,
          level,
          skill: category,
        };
        await api.post('/admin/exercise-subtypes', payload);

        // --- Upload file directly (no line-splitting to avoid breaking quoted multi-line cells) ---
        if (file) {
          setUploadProgress({ current: 0, total: 1 });
          const fd = new FormData();
          fd.append('file', file, file.name);
          fd.append('skill', category);
          fd.append('type_slug', exerciseType.slug);
          fd.append('category', 'main');
          await api.post('/admin/sync/exercises', fd);
          setUploadProgress({ current: 1, total: 1 });
        }

        showToast(true, `Created "${form.name_en}" and synced exercises`);
        onCreated();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } };
        setError(err.response?.data?.detail || 'Save failed');
      } finally {
        setSaving(false);
        setUploadProgress(null);
      }
    };

    return (
      <div style={{ position: 'relative' }}>
        {uploadProgress && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)', zIndex: 99999
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #1a1b23 0%, #111218 100%)',
              padding: '3rem', borderRadius: 24, width: 440,
              border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center'
            }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>Syncing Exercises</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Processing {uploadProgress.current} of {uploadProgress.total} rows
              </p>
              <div style={{ height: 12, width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)', transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          </div>
        )}

        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.5rem' }}>
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              CEFR Level: <strong style={{ color: 'var(--white)' }}>{level}</strong>
              &nbsp;&nbsp;Category: <strong style={{ color: 'var(--white)' }}>{category}</strong>
            </span>
          </div>

          <h2 style={{ marginBottom: '1.5rem' }}>{exerciseType.name || exerciseType.slug}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', alignItems: 'start' }}>
            <div>
              {/* Exercise Name section */}
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: 16 }}>Exercise Name</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.75rem', alignItems: 'center' }}>
                  {(['English', 'French', 'German', 'Spanish'] as const).map((lang, i) => {
                    const key = ['name_en', 'name_fr', 'name_de', 'name_es'][i] as keyof typeof form;
                    return (
                      <>
                        <label key={`lbl-${lang}`} style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-muted)' }}>{lang}</label>
                        <input key={`inp-${lang}`} className="form-control" value={form[key]} onChange={e => set(key, e.target.value)}
                          placeholder={`Name in ${lang}`} style={{ marginBottom: 0 }} />
                      </>
                    );
                  })}
                </div>
              </div>

              {/* Identifier & Slug */}
              <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Identifier Name</label>
                    <input className="form-control" value={form.identifier_name} onChange={e => set('identifier_name', e.target.value)}
                      placeholder="e.g. HTS001" />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Exercise code used as identifier prefix</p>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>SubType Slug</label>
                    <input className="form-control" value={form.subtype_slug} onChange={e => set('subtype_slug', e.target.value)}
                      placeholder="Auto-generated from code + name" />
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Default: ExerciseCode_EnglishName</p>
                  </div>
                </div>
              </div>

              {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}><AlertCircle size={16} className="inline mr-2" />{error}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" onClick={onBack}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Create Subtype'}
                </button>
              </div>
            </div>

            {/* CSV Upload panel */}
            <div style={{ width: 200 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                style={{
                  width: 180, height: 180, borderRadius: 16, border: '2px dashed var(--border)',
                  background: 'var(--card-bg)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-muted)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <Upload size={40} style={{ color: file ? 'var(--accent)' : 'var(--text-muted)', opacity: file ? 1 : 0.5 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '0 12px' }}>
                  {file ? file.name : 'Upload CSV (optional)'}
                </span>
                {file && <FileSpreadsheet size={14} style={{ color: 'var(--accent)' }} />}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
              {file && (
                <button onClick={() => setFile(null)}
                  style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={12} /> Remove file
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Root Component ───────────────────────────────────────────────────────────
  export default function MainPractice() {
    const [slide, setSlide] = useState<Slide>('main');
    const [level, setLevel] = useState<CefrLevel>('A1');
    const [category, setCategory] = useState<Category>('Reading');
    const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
    const [selectedSubtype, setSelectedSubtype] = useState<ExerciseSubtype | null>(null);
    const [selectedType, setSelectedType] = useState<QuestionType | null>(null);
    const [aiGenQt, setAiGenQt] = useState<QuestionType | null>(null);
    const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

    useEffect(() => {
      api.get('/admin/question-types')

        .then(r => setQuestionTypes(r.data.items || []))
        .catch(() => setQuestionTypes([]));
    }, []);

    const showToast = useCallback((ok: boolean, msg: string) => {
      setToast({ ok, msg });
    }, []);

    const handleEdit = (qt: QuestionType) => {
      setSelectedType(qt);
      setSlide('subtypes');
    };

    const handleView = (sub: ExerciseSubtype) => {
      setSelectedSubtype(sub);
      setSlide('exercises');
    };

    const handleCreate = () => {
      setSlide('create');
    };

    return (
      <div>
        <h1>Main Practice</h1>

        {slide === 'main' && (
          <Slide1Main
            level={level} setLevel={setLevel}
            category={category} setCategory={setCategory}
            questionTypes={questionTypes}
            setQuestionTypes={setQuestionTypes}
            onEdit={handleEdit}
            onAiGenerate={(qt) => setAiGenQt(qt)}
            showToast={showToast}
          />
        )}

        {slide === 'subtypes' && selectedType && (
          <Slide2Subtypes
            level={level} category={category} exerciseType={selectedType}
            onBack={() => setSlide('main')}
            onView={handleView}
            onCreate={handleCreate}
            onAiGenerate={(qt) => setAiGenQt(qt)}
            showToast={showToast}
          />
        )}

        {slide === 'exercises' && selectedType && selectedSubtype && (
          <Slide3Exercises
            level={level} category={category}
            exerciseType={selectedType} subtype={selectedSubtype}
            onBack={() => setSlide('subtypes')}
            onAiGenerate={(qt) => setAiGenQt(qt)}
            showToast={showToast}
          />
        )}

        {slide === 'create' && selectedType && (
          <Slide4Create
            level={level} category={category} exerciseType={selectedType}
            onBack={() => setSlide('subtypes')}
            onCreated={() => setSlide('subtypes')}
            showToast={showToast}
          />
        )}

        {aiGenQt && (
          <AIGeneratorModal
            qt={aiGenQt}
            level={level}
            category={category}
            onClose={() => setAiGenQt(null)}
            showToast={showToast}
          />
        )}

        {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
      </div>
    );
  }
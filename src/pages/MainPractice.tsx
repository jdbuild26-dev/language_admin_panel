import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Plus, Eye, Pencil, Trash2, X, Save, Download, BarChart3, MessageSquare, Power, AlertCircle, CheckCircle2, Upload, FileSpreadsheet } from 'lucide-react';
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
    'write_form',                // Fill the Form
    'write_interactive',         // Interactive Writing
    'writing_conversation',      // Writing Conversation
    'sentence_completion',       // Sentence Completion
    'write_analysis',            // Write About Data
  ],
  Speaking: [
    'speak_translate',           // Translate by Speaking
    'speak_topic',               // Speak About Topic
    'speak_image',               // Speak About Image / Describe Image
    'speak_interactive',         // Interactive Speaking
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

  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
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
              {LEVELS.map(lvl => {
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

// ─── AI Prompts Modal ─────────────────────────────────────────────────────────
function PromptsModal({ qt, onClose }: { qt: QuestionType; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/question-types/${qt.slug}/prompt`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [qt.slug]);

  const prompt = data?.prompt;
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ maxWidth: 600, width: '90%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        <h3 style={{ marginBottom: 4 }}>AI Prompts</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem', fontFamily: 'monospace' }}>{qt.slug}</p>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

        {!loading && !prompt && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p>No AI prompt configured for this exercise type.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Go to <strong>AI Prompts</strong> in the sidebar to create one.</p>
          </div>
        )}

        {prompt && (
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
            {LEVELS.map(lvl => {
              const key = lvl.toLowerCase();
              const inst = prompt[`instruction_${key}`];
              const aiP = prompt[`ai_prompt_${key}`];
              if (!inst && !aiP) return null;
              return (
                <div key={lvl} style={{ marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(31,111,235,0.1)', padding: '6px 12px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{lvl}</div>
                  {inst && <div style={{ padding: '8px 12px', fontSize: 13, borderBottom: aiP ? '1px solid var(--border)' : 'none' }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>INSTRUCTION: </span>{inst}</div>}
                  {aiP && <div style={{ padding: '8px 12px', fontSize: 13 }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>AI PROMPT: </span>{aiP}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Slide 1: Main Practice ───────────────────────────────────────────────────
function Slide1Main({
  level, setLevel, category, setCategory, questionTypes, setQuestionTypes, onEdit,
}: {
  level: CefrLevel; setLevel: (l: CefrLevel) => void;
  category: Category; setCategory: (c: Category) => void;
  questionTypes: QuestionType[];
  setQuestionTypes: React.Dispatch<React.SetStateAction<QuestionType[]>>;
  onEdit: (qt: QuestionType) => void;
}) {
  // Fetch available slugs for the selected level from the same endpoint the practice page uses.
  const [availableSlugs, setAvailableSlugs] = useState<string[] | null>(null);
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
      .then(r => setAvailableSlugs(Array.isArray(r.data.slugs) ? r.data.slugs : null))
      .catch(() => setAvailableSlugs(null))
      .finally(() => setSlugsLoading(false));
  }, [level]);

  // Filter: must be in this category's slug list AND available at this level
  const visibleTypes = questionTypes.filter(qt =>
    SKILL_SLUGS[category].includes(qt.slug) &&
    (availableSlugs === null || availableSlugs.includes(qt.slug))
  );

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
      {promptsQt && <PromptsModal qt={promptsQt} onClose={() => setPromptsQt(null)} />}
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

// ─── Slide 2: Subtypes List ───────────────────────────────────────────────────
function Slide2Subtypes({
  level, category, exerciseType,
  onBack, onView, onCreate,
  showToast,
}: {
  level: CefrLevel; category: Category; exerciseType: QuestionType;
  onBack: () => void; onView: (sub: ExerciseSubtype) => void; onCreate: () => void;
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
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
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
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Update failed');
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
        <button onClick={onCreate} title="Create new subtype"
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={18} />
        </button>
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
    </div>
  );
}

// ─── Slide 3: Exercise List (View) ────────────────────────────────────────────
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
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to load'); }
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
    } catch (e: any) { setError(e.response?.data?.detail || 'Save failed'); }
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
  onBack, showToast,
}: {
  level: CefrLevel; category: Category; exerciseType: QuestionType; subtype: ExerciseSubtype;
  onBack: () => void;
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
  // editingId: which row is in edit mode (null = none)
  const [editingId, setEditingId] = useState<string | null>(null);
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
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
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
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Update failed');
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
                                  {/* Edit / Save toggle */}
                                  <button
                                    title={editingId === ex.external_id ? 'Close editor' : 'Edit'}
                                    onClick={() => setEditingId(editingId === ex.external_id ? null : ex.external_id)}
                                    style={iconBtnStyle(editingId === ex.external_id ? '#f59e0b' : '#60a5fa')}>
                                    <Pencil size={13} />
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
                            {/* Inline editor — expands below the row when pencil clicked */}
                            {editingId === ex.external_id && (
                              <tr key={`editor-${ex.external_id}`}>
                                <td colSpan={4} style={{ padding: '1rem 1.5rem', background: 'rgba(31,111,235,0.04)', borderBottom: '2px solid var(--accent)' }}>
                                  <ExcelRowEditor
                                    key={ex.external_id}
                                    externalId={ex.external_id}
                                    onSaved={() => {
                                      showToast(true, `Saved ${ex.external_id}`);
                                      load(page);
                                    }}
                                  />
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

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

      // If a CSV file was also provided, upload it
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('skill', category);
        fd.append('type_slug', exerciseType.slug);
        fd.append('category', 'main');
        await api.post('/admin/sync/exercises', fd);
      }

      showToast(true, `Created "${form.name_en}"`);
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
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
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function MainPractice() {
  const [slide, setSlide] = useState<Slide>('main');
  const [level, setLevel] = useState<CefrLevel>('A1');
  const [category, setCategory] = useState<Category>('Reading');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [selectedType, setSelectedType] = useState<QuestionType | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<ExerciseSubtype | null>(null);
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
        />
      )}

      {slide === 'subtypes' && selectedType && (
        <Slide2Subtypes
          level={level} category={category} exerciseType={selectedType}
          onBack={() => setSlide('main')}
          onView={handleView}
          onCreate={handleCreate}
          showToast={showToast}
        />
      )}

      {slide === 'exercises' && selectedType && selectedSubtype && (
        <Slide3Exercises
          level={level} category={category}
          exerciseType={selectedType} subtype={selectedSubtype}
          onBack={() => setSlide('subtypes')}
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

      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Loader2, MessageSquare, HelpCircle, Settings } from 'lucide-react';
import api from '../services/api';

interface DialogueLine {
  line_number: number;
  person: string;
  gender: string;
  text_fr: string;
  text_en: string;
  text_es: string;
  text_de: string;
}

interface QuizQuestion {
  question_number: number;
  question_fr: string;
  question_en: string;
  question_es: string;
  question_de: string;
  correct_fr: string;
  correct_en: string;
  correct_es: string;
  correct_de: string;
  distractor1_fr: string;
  distractor1_en: string;
  distractor1_es: string;
  distractor1_de: string;
  distractor2_fr: string;
  distractor2_en: string;
  distractor2_es: string;
  distractor2_de: string;
  distractor3_fr: string;
  distractor3_en: string;
  distractor3_es: string;
  distractor3_de: string;
  explanation_fr: string;
  explanation_en: string;
  explanation_es: string;
  explanation_de: string;
}

interface StoryData {
  exercise_id: string;
  story_type: string;
  vocabulary_tag: string;
  grammar_tag: string;
  level: string;
  shuffle_quiz: boolean;
  title_fr: string;
  title_en: string;
  title_es: string;
  title_de: string;
  description_fr: string;
  description_en: string;
  description_es: string;
  description_de: string;
  paragraph_fr?: string;
  paragraph_en?: string;
  paragraph_es?: string;
  paragraph_de?: string;
  dialogue_lines: DialogueLine[];
  quiz_questions: QuizQuestion[];
}

interface StoryEditorProps {
  exerciseId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (ok: boolean, msg: string) => void;
}

export default function StoryEditor({ exerciseId, onClose, onSaved, showToast }: StoryEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [story, setStory] = useState<StoryData | null>(null);
  const [activeTab, setActiveTab] = useState<'meta' | 'dialogue' | 'quiz'>('meta');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/story-flow/${exerciseId}`)
      .then(res => setStory(res.data))
      .catch(err => {
        console.error(err);
        showToast(false, 'Failed to load story data');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [exerciseId, onClose, showToast]);

  const handleSave = async () => {
    if (!story) return;
    setSaving(true);
    try {
      await api.patch(`/admin/story-flow/${exerciseId}`, story);
      showToast(true, 'Story updated successfully');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(false, err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (idx: number, patch: Partial<DialogueLine>) => {
    if (!story) return;
    const newLines = [...story.dialogue_lines];
    newLines[idx] = { ...newLines[idx], ...patch };
    setStory({ ...story, dialogue_lines: newLines });
  };

  const addLine = () => {
    if (!story) return;
    const newLine: DialogueLine = {
      line_number: story.dialogue_lines.length + 1,
      person: '',
      gender: 'Masculine',
      text_fr: '',
      text_en: '',
      text_es: '',
      text_de: ''
    };
    setStory({ ...story, dialogue_lines: [...story.dialogue_lines, newLine] });
  };

  const removeLine = (idx: number) => {
    if (!story) return;
    const newLines = story.dialogue_lines.filter((_, i) => i !== idx)
      .map((line, i) => ({ ...line, line_number: i + 1 }));
    setStory({ ...story, dialogue_lines: newLines });
  };

  const updateQuiz = (idx: number, patch: Partial<QuizQuestion>) => {
    if (!story) return;
    const newQuiz = [...story.quiz_questions];
    newQuiz[idx] = { ...newQuiz[idx], ...patch };
    setStory({ ...story, quiz_questions: newQuiz });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', borderRadius: 12 }}>
        <Loader2 size={32} className="animate-spin" style={{ marginBottom: 12, color: 'var(--primary)' }} />
        <p>Loading story content...</p>
      </div>
    );
  }

  if (!story) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit Story: {exerciseId}</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{story.story_type.toUpperCase()} · Level {story.level}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} style={{ marginRight: 8 }} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
        <TabButton active={activeTab === 'meta'} onClick={() => setActiveTab('meta')} icon={<Settings size={14} />} label="General & Metadata" />
        <TabButton active={activeTab === 'dialogue'} onClick={() => setActiveTab('dialogue')} icon={<MessageSquare size={14} />} label={story.story_type === 'monologue' ? 'Monologue Content' : 'Dialogue Lines'} />
        <TabButton active={activeTab === 'quiz'} onClick={() => setActiveTab('quiz')} icon={<HelpCircle size={14} />} label="Quiz Questions" />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {activeTab === 'meta' && (
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Section title="Titles">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="English Title" value={story.title_en} onChange={v => setStory({ ...story, title_en: v })} />
                <Field label="French Title" value={story.title_fr} onChange={v => setStory({ ...story, title_fr: v })} />
                <Field label="Spanish Title" value={story.title_es} onChange={v => setStory({ ...story, title_es: v })} />
                <Field label="German Title" value={story.title_de} onChange={v => setStory({ ...story, title_de: v })} />
              </div>
            </Section>

            <Section title="Descriptions">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <AreaField label="English Description" value={story.description_en} onChange={v => setStory({ ...story, description_en: v })} />
                <AreaField label="French Description" value={story.description_fr} onChange={v => setStory({ ...story, description_fr: v })} />
              </div>
            </Section>

            <Section title="Settings">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <Field label="Level" value={story.level} onChange={v => setStory({ ...story, level: v })} />
                <Field label="Vocabulary Tag" value={story.vocabulary_tag} onChange={v => setStory({ ...story, vocabulary_tag: v })} />
                <Field label="Grammar Tag" value={story.grammar_tag} onChange={v => setStory({ ...story, grammar_tag: v })} />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={story.shuffle_quiz} onChange={e => setStory({ ...story, shuffle_quiz: e.target.checked })} />
                  <span style={{ fontSize: 14 }}>Shuffle Quiz Answers</span>
                </label>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'dialogue' && (
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            {story.story_type === 'monologue' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <Section title="Monologue Paragraphs">
                  <AreaField label="English Paragraph" rows={8} value={story.paragraph_en || ''} onChange={v => setStory({ ...story, paragraph_en: v })} />
                  <AreaField label="French Paragraph" rows={8} value={story.paragraph_fr || ''} onChange={v => setStory({ ...story, paragraph_fr: v })} />
                </Section>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {story.dialogue_lines.map((line, idx) => (
                  <div key={idx} className="card" style={{ padding: '1rem', border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', width: 24 }}>{line.line_number}</span>
                        <input 
                          placeholder="Speaker" 
                          value={line.person} 
                          onChange={e => updateLine(idx, { person: e.target.value })} 
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, width: 120 }}
                        />
                        <select 
                          value={line.gender} 
                          onChange={e => updateLine(idx, { gender: e.target.value })}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
                        >
                          <option value="Masculine">Masculine</option>
                          <option value="Feminine">Feminine</option>
                        </select>
                      </div>
                      <button onClick={() => removeLine(idx)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <AreaField label="English" rows={2} value={line.text_en} onChange={v => updateLine(idx, { text_en: v })} />
                      <AreaField label="French" rows={2} value={line.text_fr} onChange={v => updateLine(idx, { text_fr: v })} />
                    </div>
                  </div>
                ))}
                <button className="btn" onClick={addLine} style={{ alignSelf: 'center', marginTop: '1rem', border: '1px dashed var(--border)', background: 'transparent', padding: '12px 24px' }}>
                  <Plus size={16} style={{ marginRight: 8 }} /> Add Dialogue Line
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'quiz' && (
          <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {story.quiz_questions.map((q, idx) => (
              <div key={idx} className="card" style={{ padding: '1.5rem', border: '1px solid var(--border)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--primary)' }}>Question {q.question_number}</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <AreaField label="Question (EN)" value={q.question_en} onChange={v => updateQuiz(idx, { question_en: v })} />
                    <Field label="Correct Answer (EN)" value={q.correct_en} onChange={v => updateQuiz(idx, { correct_en: v })} />
                    <Field label="Distractor 1 (EN)" value={q.distractor1_en} onChange={v => updateQuiz(idx, { distractor1_en: v })} />
                    <Field label="Distractor 2 (EN)" value={q.distractor2_en} onChange={v => updateQuiz(idx, { distractor2_en: v })} />
                    <Field label="Distractor 3 (EN)" value={q.distractor3_en} onChange={v => updateQuiz(idx, { distractor3_en: v })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <AreaField label="Question (FR)" value={q.question_fr} onChange={v => updateQuiz(idx, { question_fr: v })} />
                    <Field label="Correct Answer (FR)" value={q.correct_fr} onChange={v => updateQuiz(idx, { correct_fr: v })} />
                    <Field label="Distractor 1 (FR)" value={q.distractor1_fr} onChange={v => updateQuiz(idx, { distractor1_fr: v })} />
                    <Field label="Distractor 2 (FR)" value={q.distractor2_fr} onChange={v => updateQuiz(idx, { distractor2_fr: v })} />
                    <Field label="Distractor 3 (FR)" value={q.distractor3_fr} onChange={v => updateQuiz(idx, { distractor3_fr: v })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      style={{
        padding: '0.75rem 1.5rem',
        background: active ? 'rgba(31,111,235,0.1)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s'
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</label>
      <input 
        className="form-control" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        style={{ fontSize: 13, padding: '8px 12px' }}
      />
    </div>
  );
}

function AreaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</label>
      <textarea 
        className="form-control" 
        rows={rows}
        value={value} 
        onChange={e => onChange(e.target.value)} 
        style={{ fontSize: 13, padding: '8px 12px', resize: 'vertical' }}
      />
    </div>
  );
}

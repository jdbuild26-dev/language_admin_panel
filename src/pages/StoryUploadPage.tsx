import { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ArrowRight, ArrowLeft } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';

interface UploadState {
  learningLang: string;
  level: string;
  storyType: string;
  step: 1 | 2;
  csvPart1: File | null;
  csvPart2: File | null;
  csvContent: File | null;
  csvQuiz: File | null;
  loading: boolean;
  error: string | null;
  success: { exerciseIds: string[] } | null;
}

const INITIAL_STATE: UploadState = {
  learningLang: '',
  level: '',
  storyType: '',
  step: 1,
  csvPart1: null,
  csvPart2: null,
  csvContent: null,
  csvQuiz: null,
  loading: false,
  error: null,
  success: null,
};

export default function StoryUploadPage() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const [syncLang, setSyncLang] = useState('fr');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const part1Ref = useRef<HTMLInputElement>(null);
  const part2Ref = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);
  const quizRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<UploadState>) =>
    setState(prev => ({ ...prev, ...patch }));

  const step1Complete =
    state.learningLang !== '' && state.level !== '' && state.storyType !== '';

  const step2Complete =
    state.storyType === 'Dialogue'
      ? state.csvPart1 !== null && state.csvPart2 !== null && state.csvQuiz !== null
      : state.csvContent !== null && state.csvQuiz !== null;

  const handleUpload = async () => {
    update({ loading: true, error: null, success: null });

    const formData = new FormData();
    formData.append('story_type', state.storyType.toLowerCase());
    formData.append('learning_lang', state.learningLang);
    formData.append('level', state.level);

    if (state.storyType === 'Dialogue') {
      formData.append('csv_part1', state.csvPart1!);
      formData.append('csv_part2', state.csvPart2!);
      formData.append('csv_quiz', state.csvQuiz!);
    } else {
      formData.append('csv_content', state.csvContent!);
      formData.append('csv_quiz', state.csvQuiz!);
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/story-flow/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.status === 201) {
        const data = await res.json();
        update({ loading: false, success: { exerciseIds: data.exercise_ids } });
      } else {
        const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        update({ loading: false, error: data.detail || 'Upload failed' });
      }
    } catch {
      update({ loading: false, error: 'Network error: Unable to reach server' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const formData = new FormData();
      formData.append('learning_lang', syncLang);
      const res = await fetch(`${API_BASE}/api/admin/story-flow/sync-story-concepts`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${data.count} stories: ${(data.synced as string[]).join(', ') || 'none'}`);
      } else {
        setSyncResult(`Error: ${data.detail || 'Sync failed'}`);
      }
    } catch {
      setSyncResult('Network error: Unable to reach server');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <h1>Upload Story</h1>
      <p className="mb-8 text-muted">
        Create interactive story content by uploading structured CSV files.
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '2rem' }}>
        <StepBadge n={1} active={state.step === 1} done={state.step === 2} label="Configure" />
        <div style={{ width: 32, height: 2, background: 'var(--border)' }} />
        <StepBadge n={2} active={state.step === 2} done={false} label="Upload Files" />
      </div>

      <div className="card">
        {state.step === 1 && (
          <>
            <h2 style={{ marginBottom: '1.5rem' }}>Step 1 — Story Configuration</h2>

            <div className="form-group">
              <label className="form-label">Learning Language</label>
              <select
                className="form-control"
                value={state.learningLang}
                onChange={e => update({ learningLang: e.target.value })}
              >
                <option value="">Select language…</option>
                <option value="fr">French (fr)</option>
                <option value="en">English (en)</option>
                <option value="es">Spanish (es)</option>
                <option value="de">German (de)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">CEFR Level</label>
              <select
                className="form-control"
                value={state.level}
                onChange={e => update({ level: e.target.value })}
              >
                <option value="">Select level…</option>
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Story Type</label>
              <select
                className="form-control"
                value={state.storyType}
                onChange={e => update({ storyType: e.target.value })}
              >
                <option value="">Select type…</option>
                <option value="Dialogue">Dialogue</option>
                <option value="Monologue">Monologue</option>
              </select>
            </div>

            <button
              className="btn btn-primary"
              disabled={!step1Complete}
              onClick={() => update({ step: 2, error: null })}
              style={{ marginTop: '0.5rem' }}
            >
              Next <ArrowRight size={18} />
            </button>
          </>
        )}

        {state.step === 2 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Step 2 — Upload CSV Files</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {state.storyType} · {state.learningLang.toUpperCase()} · {state.level}
              </span>
            </div>

            {state.storyType === 'Dialogue' ? (
              <>
                <FileInput
                  label="Content Part 1 CSV"
                  file={state.csvPart1}
                  inputRef={part1Ref}
                  onChange={f => update({ csvPart1: f, error: null, success: null })}
                />
                <FileInput
                  label="Content Part 2 CSV"
                  file={state.csvPart2}
                  inputRef={part2Ref}
                  onChange={f => update({ csvPart2: f, error: null, success: null })}
                />
                <FileInput
                  label="Quiz CSV"
                  file={state.csvQuiz}
                  inputRef={quizRef}
                  onChange={f => update({ csvQuiz: f, error: null, success: null })}
                />
              </>
            ) : (
              <>
                <FileInput
                  label="Content CSV"
                  file={state.csvContent}
                  inputRef={contentRef}
                  onChange={f => update({ csvContent: f, error: null, success: null })}
                />
                <FileInput
                  label="Quiz CSV"
                  file={state.csvQuiz}
                  inputRef={quizRef}
                  onChange={f => update({ csvQuiz: f, error: null, success: null })}
                />
              </>
            )}

            {state.error && (
              <div className="alert alert-error">
                <AlertCircle size={18} style={{ display: 'inline', marginRight: 8 }} />
                {state.error}
              </div>
            )}

            {state.success && (
              <div className="alert alert-success">
                <CheckCircle2 size={18} style={{ display: 'inline', marginRight: 8 }} />
                Successfully created: {state.success.exerciseIds.join(', ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => update({ step: 1, error: null, success: null })}
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <ArrowLeft size={18} /> Back
              </button>
              <button
                className="btn btn-primary"
                disabled={!step2Complete || state.loading}
                onClick={handleUpload}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {state.loading ? (
                  <>
                    <Spinner /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={18} /> Upload
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Back-fill: sync existing stories into Story Concepts ── */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Sync Existing Stories to Story Concepts</h2>
        <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
          Stories uploaded before auto-registration was added won't appear on the /stories page.
          Run this once to back-fill them.
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ marginBottom: '0.25rem' }}>Learning Language</label>
            <select
              className="form-control"
              value={syncLang}
              onChange={e => setSyncLang(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="fr">French (fr)</option>
              <option value="en">English (en)</option>
              <option value="es">Spanish (es)</option>
              <option value="de">German (de)</option>
            </select>
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={syncing}
            style={{ marginTop: '1.25rem' }}
          >
            {syncing ? <><Spinner /> Syncing…</> : 'Sync Now'}
          </button>
        </div>
        {syncResult && (
          <div
            className={syncResult.startsWith('Error') ? 'alert alert-error' : 'alert alert-success'}
            style={{ marginTop: '1rem' }}
          >
            {syncResult}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepBadge({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  const bg = done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)';
  const color = active || done ? '#fff' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: bg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: '0.85rem',
      }}>
        {n}
      </div>
      <span style={{ fontSize: '0.9rem', fontWeight: active ? 600 : 400, color }}>{label}</span>
    </div>
  );
}

interface FileInputProps {
  label: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (f: File | null) => void;
}

function FileInput({ label, file, inputRef, onChange }: FileInputProps) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        style={{
          border: `2px dashed ${file ? 'var(--success)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '1rem 1.25rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          transition: 'border-color 0.2s',
          background: file ? 'rgba(46,160,67,0.05)' : 'transparent',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet size={20} color={file ? 'var(--success)' : 'var(--text-muted)'} />
        <span style={{ fontSize: '0.9rem', color: file ? 'var(--success)' : 'var(--text-muted)', flex: 1 }}>
          {file ? file.name : 'Click to select .csv or .xlsx'}
        </span>
        {file && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        style={{ display: 'none' }}
        onChange={e => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="18" height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

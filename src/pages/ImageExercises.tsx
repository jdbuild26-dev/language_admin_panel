import { useState, useRef } from 'react';
import { Upload, Plus, Trash2, Save, Image, Tag, CheckCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

// ---------------------------------------------------------------------------
// Shared image uploader
// ---------------------------------------------------------------------------
function ImageUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ url: string }>('/admin/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded(res.data.url);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Upload failed');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">Image</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        style={{
          border: '2px dashed var(--border, #444)', borderRadius: 12, padding: '1.5rem',
          textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary, #1a1a2e)',
          minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {uploading ? (
          <><Loader2 size={28} className="animate-spin" style={{ color: '#60a5fa' }} /><span style={{ fontSize: 13, opacity: 0.6 }}>Uploading…</span></>
        ) : preview ? (
          <img src={preview} alt="preview" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
        ) : (
          <><Upload size={28} style={{ opacity: 0.4 }} /><span style={{ fontSize: 13, opacity: 0.5 }}>Click or drag & drop an image</span></>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {error && <div className="alert alert-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image Labelling form
// ---------------------------------------------------------------------------
interface LabelItem { x: number; y: number; name: string; }

function ImageLabellingForm() {
  const [title, setTitle] = useState('');
  const [instructionEn, setInstructionEn] = useState('');
  const [instructionFr, setInstructionFr] = useState('');
  const [level, setLevel] = useState<string>('A1');
  const [imageUrl, setImageUrl] = useState('');
  const [items, setItems] = useState<LabelItem[]>([{ x: 0.5, y: 0.5, name: '' }]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const addItem = () => setItems(p => [...p, { x: 0.5, y: 0.5, name: '' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LabelItem, val: string | number) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const handleSave = async () => {
    if (!imageUrl) { setError('Please upload an image first'); return; }
    if (!title.trim()) { setError('Title is required'); return; }
    if (items.some(it => !it.name.trim())) { setError('All label names must be filled'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/admin/exercises/image-labelling', {
        title, instruction_en: instructionEn, instruction_fr: instructionFr,
        level, image_url: imageUrl, items,
      });
      setSuccess(`Saved! Exercise ID: ${res.data.external_id}`);
      setTitle(''); setInstructionEn(''); setInstructionFr(''); setImageUrl(''); setItems([{ x: 0.5, y: 0.5, name: '' }]);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Left: image + preview */}
      <div style={{ flex: '0 0 340px' }}>
        <ImageUploader onUploaded={setImageUrl} />
        {imageUrl && (
          <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
            <img src={imageUrl} alt="uploaded" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
            {items.map((item, i) => (
              <div key={i} title={item.name} style={{
                position: 'absolute', left: `${item.x * 100}%`, top: `${item.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 22, height: 22, borderRadius: '50%',
                background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                cursor: 'default',
              }}>{i + 1}</div>
            ))}
          </div>
        )}
      </div>

      {/* Right: fields */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <div className="grid grid-2 gap-2 mb-4">
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kitchen Labelling" />
          </div>
          <div className="form-group">
            <label className="form-label">Level</label>
            <select className="form-control" value={level} onChange={e => setLevel(e.target.value)}>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Instruction (EN)</label>
            <input className="form-control" value={instructionEn} onChange={e => setInstructionEn(e.target.value)} placeholder="Label the image" />
          </div>
          <div className="form-group">
            <label className="form-label">Instruction (FR)</label>
            <input className="form-control" value={instructionFr} onChange={e => setInstructionFr(e.target.value)} placeholder="Étiquetez l'image" />
          </div>
        </div>

        {/* Label items */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Labels ({items.length})</label>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: 13 }} onClick={addItem}>
              <Plus size={14} style={{ marginRight: 4 }} />Add Label
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <input className="form-control" style={{ flex: 2 }} placeholder="Label name (e.g. Refrigerator)" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                <input className="form-control" style={{ width: 70 }} type="number" min={0} max={1} step={0.01} placeholder="X (0-1)" value={item.x} onChange={e => updateItem(i, 'x', parseFloat(e.target.value) || 0)} />
                <input className="form-control" style={{ width: 70 }} type="number" min={0} max={1} step={0.01} placeholder="Y (0-1)" value={item.y} onChange={e => updateItem(i, 'y', parseFloat(e.target.value) || 0)} />
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }} disabled={items.length === 1}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>X/Y are relative positions (0.0 = left/top, 1.0 = right/bottom). The blue dots show on the preview above.</p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
        {success && <div className="alert" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', marginBottom: 8, borderRadius: 8, padding: '0.75rem 1rem' }}><CheckCircle size={14} style={{ marginRight: 6, display: 'inline' }} />{success}</div>}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={16} style={{ marginRight: 6 }} />}
          {saving ? 'Saving…' : 'Save Exercise'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image MCQ form
// ---------------------------------------------------------------------------
interface MCQOption { text: string; english: string; }

function ImageMCQForm() {
  const [question, setQuestion] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [instructionEn, setInstructionEn] = useState('Which describes this image?');
  const [instructionFr, setInstructionFr] = useState('Quelle phrase décrit cette image ?');
  const [level, setLevel] = useState<string>('A1');
  const [imageUrl, setImageUrl] = useState('');
  const [options, setOptions] = useState<MCQOption[]>([
    { text: '', english: '' },
    { text: '', english: '' },
    { text: '', english: '' },
    { text: '', english: '' },
  ]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const updateOption = (i: number, field: keyof MCQOption, val: string) =>
    setOptions(p => p.map((o, idx) => idx === i ? { ...o, [field]: val } : o));
  const addOption = () => setOptions(p => [...p, { text: '', english: '' }]);
  const removeOption = (i: number) => {
    setOptions(p => p.filter((_, idx) => idx !== i));
    if (correctIndex >= i && correctIndex > 0) setCorrectIndex(c => c - 1);
  };

  const handleSave = async () => {
    if (!imageUrl) { setError('Please upload an image first'); return; }
    if (!question.trim()) { setError('Question is required'); return; }
    if (options.some(o => !o.text.trim())) { setError('All French options must be filled'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/admin/exercises/image-mcq', {
        question, instruction_en: instructionEn, instruction_fr: instructionFr,
        level, image_url: imageUrl, image_alt: imageAlt, options, correct_index: correctIndex,
      });
      setSuccess(`Saved! Exercise ID: ${res.data.external_id}`);
      setQuestion(''); setImageAlt(''); setImageUrl('');
      setOptions([{ text: '', english: '' }, { text: '', english: '' }, { text: '', english: '' }, { text: '', english: '' }]);
      setCorrectIndex(0);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Left: image */}
      <div style={{ flex: '0 0 300px' }}>
        <ImageUploader onUploaded={setImageUrl} />
        {imageUrl && <img src={imageUrl} alt="preview" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
      </div>

      {/* Right: fields */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <div className="grid grid-2 gap-2 mb-4">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Question *</label>
            <input className="form-control" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Which describes this image?" />
          </div>
          <div className="form-group">
            <label className="form-label">Image Alt Text</label>
            <input className="form-control" value={imageAlt} onChange={e => setImageAlt(e.target.value)} placeholder="e.g. A cat sleeping" />
          </div>
          <div className="form-group">
            <label className="form-label">Level</label>
            <select className="form-control" value={level} onChange={e => setLevel(e.target.value)}>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Instruction (EN)</label>
            <input className="form-control" value={instructionEn} onChange={e => setInstructionEn(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Instruction (FR)</label>
            <input className="form-control" value={instructionFr} onChange={e => setInstructionFr(e.target.value)} />
          </div>
        </div>

        {/* Options */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Options</label>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: 13 }} onClick={addOption}>
              <Plus size={14} style={{ marginRight: 4 }} />Add Option
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Correct radio */}
                <input type="radio" name="correct" checked={correctIndex === i} onChange={() => setCorrectIndex(i)}
                  title="Mark as correct answer" style={{ cursor: 'pointer', accentColor: '#10b981', width: 16, height: 16, flexShrink: 0 }} />
                <input className="form-control" style={{ flex: 1 }} placeholder={`Option ${i + 1} (French)`} value={opt.text} onChange={e => updateOption(i, 'text', e.target.value)} />
                <input className="form-control" style={{ flex: 1 }} placeholder={`Option ${i + 1} (English)`} value={opt.english} onChange={e => updateOption(i, 'english', e.target.value)} />
                <button onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }} disabled={options.length <= 2}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Select the radio button on the left to mark the correct answer (currently: option {correctIndex + 1}).</p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
        {success && <div className="alert" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', marginBottom: 8, borderRadius: 8, padding: '0.75rem 1rem' }}><CheckCircle size={14} style={{ marginRight: 6, display: 'inline' }} />{success}</div>}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={16} style={{ marginRight: 6 }} />}
          {saving ? 'Saving…' : 'Save Exercise'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ImageExercises() {
  const [tab, setTab] = useState<'labelling' | 'mcq'>('labelling');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Image Exercises</h1>
          <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: 14 }}>Create image labelling and image description exercises</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #333)', marginBottom: '1.5rem' }}>
        {([['labelling', 'Image Labelling', Tag], ['mcq', 'Image Description (MCQ)', Image]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '0.75rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer',
              color: tab === id ? '#60a5fa' : 'inherit', opacity: tab === id ? 1 : 0.5,
              borderBottom: tab === id ? '2px solid #60a5fa' : '2px solid transparent',
              fontWeight: tab === id ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: -1, fontSize: 14,
            }}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'labelling' ? (
          <>
            <h2 style={{ marginBottom: '0.5rem' }}>Image Labelling</h2>
            <p style={{ opacity: 0.5, fontSize: 13, marginBottom: '1.5rem' }}>
              Upload an image and add numbered labels with X/Y positions. Students will match numbers to words.
            </p>
            <ImageLabellingForm />
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: '0.5rem' }}>Image Description (MCQ)</h2>
            <p style={{ opacity: 0.5, fontSize: 13, marginBottom: '1.5rem' }}>
              Upload an image, write a question, and provide multiple choice options. Mark the correct answer.
            </p>
            <ImageMCQForm />
          </>
        )}
      </div>
    </div>
  );
}

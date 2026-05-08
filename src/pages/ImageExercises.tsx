import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Plus, Trash2, Save, Image, Tag, CheckCircle, Loader2, FileSpreadsheet, ChevronLeft, ChevronRight, X, AlertCircle, ImageIcon } from 'lucide-react';
import api from '../services/api';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const MAX_CSV_ROWS = 200;

// ---------------------------------------------------------------------------
// Shared image uploader
// ---------------------------------------------------------------------------
function ImageUploader({ onUploaded, existingUrl }: { onUploaded: (url: string) => void; existingUrl?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl || null);
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
      setPreview(res.data.url);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Upload failed');
      setPreview(existingUrl || null);
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
          <><Loader2 size={28} className="animate-spin" style={{ color: '#60a5fa' }} /><span style={{ fontSize: 13, opacity: 0.6 }}>Uploading...</span></>
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
// CSV Bulk Image Upload flow
// ---------------------------------------------------------------------------
interface CsvRow {
  [key: string]: string;
}

interface WorkingRow {
  index: number;
  exerciseId: string;
  imageUrl: string;       // filled after upload
  data: CsvRow;           // all original CSV columns
  typeSlug: string;
  level: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find header row - skip comment rows (rows where first cell doesnt look like a column name)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsvLine(lines[i]);
    const lower = cells.map(c => c.toLowerCase().trim());
    if (lower.some(c => ['exerciseid', 'exercise id', 'heading_en', 'heading_fr', 'image link from cloudinary', 'level'].includes(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCsvLine(lines[headerIdx]).map(h => h.trim());
  const rows: CsvRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every(c => !c.trim())) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function detectTypeSlug(row: CsvRow): string {
  const qt = (row['Question Type'] || row['QuestionType'] || row['questiontype'] || '').toLowerCase().trim();
  if (qt === 'diagram labelling') return 'diagram_mapping';
  if (qt === 'match image to description') return 'match_image_description';
  if (qt === 'image labelling') return 'image_labelling';
  if (qt === 'image mcq') return 'image_mcq';
  if (qt) return qt.replace(/\s+/g, '_');
  
  // Infer from columns
  if ('Correct Answer 1_FR' in row || 'Correct Answer 1_EN' in row) return 'image_labelling';
  if ('Correct answer_FR' in row || 'options_fr' in row) return 'image_mcq';
  if ('Answer 1_FR' in row || 'answers_fr' in row) return 'diagram_mapping';
  return 'image_labelling';
}

function detectLevel(row: CsvRow): string {
  return row['Level'] || row['level'] || 'A1';
}

function getExerciseId(row: CsvRow): string {
  return row['ExerciseID'] || row['exerciseid'] || row['Exercise ID'] || '';
}

function CsvBulkUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<WorkingRow[]>([]);
  const [subtypes, setSubtypes] = useState<any[]>([]);
  const [selectedSubtype, setSelectedSubtype] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number; skipped: number; errors: any[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/exercise-subtypes').then(res => {
      setSubtypes(res.data.items || []);
    }).catch(err => {
      console.error("Failed to load subtypes:", err);
    });
  }, []);

  const handleCsvFile = (file: File) => {
    setError('');
    setSaveResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) { setError('No data rows found in CSV'); return; }
      if (parsed.length > MAX_CSV_ROWS) {
        setError(`CSV has ${parsed.length} rows. Maximum allowed is ${MAX_CSV_ROWS}. Please split your file.`);
        return;
      }
      const working: WorkingRow[] = parsed.map((row, i) => ({
        index: i,
        exerciseId: getExerciseId(row),
        imageUrl: row['Image link from Cloudinary'] || row['imageUrl'] || row['image_url'] || '',
        data: row,
        typeSlug: detectTypeSlug(row),
        level: detectLevel(row),
      }));
      setRows(working);
      setCurrentIdx(0);
    };
    reader.readAsText(file);
  };

  const handleImageUploaded = useCallback((url: string) => {
    setRows(prev => prev.map((r, i) => i === currentIdx ? { ...r, imageUrl: url } : r));
  }, [currentIdx]);

  const handleBulkSave = async () => {
    const toSave = rows.filter(r => r.imageUrl);
    if (toSave.length === 0) { setError('No rows have images uploaded yet'); return; }
    setSaving(true); setError(''); setSaveResult(null);
    try {
      const payload = {
        rows: toSave.map(r => ({
          exercise_id: r.exerciseId,
          image_url: r.imageUrl,
          type_slug: r.typeSlug,
          subtype_slug: selectedSubtype || undefined,
          level: r.level,
          skill: 'Reading',
          category: 'main',
          row_data: r.data,
        })),
      };
      const res = await api.post('/admin/image-exercises/bulk-save', payload);
      setSaveResult(res.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const withImages = rows.filter(r => r.imageUrl).length;
  const current = rows[currentIdx];

  // ── Empty state ──
  if (rows.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Exercise Subtype (Optional)</label>
            <select 
              className="form-control" 
              value={selectedSubtype} 
              onChange={e => setSelectedSubtype(e.target.value)}
            >
              <option value="">-- Autodetect or No Subtype --</option>
              {subtypes.map(st => (
                <option key={st.id} value={st.subtype_slug}>
                  {st.name_en} ({st.type_slug})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
          style={{
            border: '2px dashed var(--border)', borderRadius: 16, padding: '3rem',
            textAlign: 'center', cursor: 'pointer', background: 'var(--card-bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <FileSpreadsheet size={40} style={{ opacity: 0.4 }} />
          <div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Upload your CSV file</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              The CSV should have an <code>Image link from Cloudinary</code> column (can be empty).<br />
              Max {MAX_CSV_ROWS} rows per upload.
            </p>
          </div>
          <button className="btn btn-primary" style={{ pointerEvents: 'none' }}>
            <Upload size={14} className="inline mr-1" /> Choose CSV
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}><AlertCircle size={14} className="inline mr-1" />{error}</div>}
      </div>
    );
  }

  // ── Working state ──
  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" style={{ padding: '5px 10px' }}
            onClick={() => { setRows([]); setSaveResult(null); setError(''); }}>
            <X size={14} className="inline mr-1" /> Clear
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {rows.length} rows loaded &nbsp;·&nbsp;
            <span style={{ color: withImages > 0 ? '#4ade80' : 'var(--text-muted)' }}>
              {withImages} with images
            </span>
          </span>
        </div>
        <button className="btn btn-primary" onClick={handleBulkSave} disabled={saving || withImages === 0}>
          {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : <Save size={14} className="inline mr-1" />}
          {saving ? 'Saving...' : `Save Progress (${withImages} rows)`}
        </button>
      </div>

      {/* Save result */}
      {saveResult && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 13 }}>
          <CheckCircle size={14} className="inline mr-1" style={{ color: '#4ade80' }} />
          Saved {saveResult.saved} exercises.
          {saveResult.skipped > 0 && <span style={{ color: 'var(--text-muted)' }}> {saveResult.skipped} skipped (no image).</span>}
          {saveResult.errors.length > 0 && <span style={{ color: '#f87171' }}> {saveResult.errors.length} errors.</span>}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={14} className="inline mr-1" />{error}</div>}

      {/* Row overview table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ overflowX: 'auto', maxHeight: 220 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', width: 40 }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Exercise ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Type</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Level</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Image</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}
                  onClick={() => setCurrentIdx(i)}
                  style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: i === currentIdx ? 'rgba(31,111,235,0.12)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (i !== currentIdx) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { if (i !== currentIdx) e.currentTarget.style.background = 'transparent'; }}>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{row.exerciseId || '—'}</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{row.typeSlug}</td>
                  <td style={{ padding: '6px 12px' }}>
                    <span style={{ background: 'rgba(31,111,235,0.15)', color: 'var(--accent)', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 700 }}>{row.level}</span>
                  </td>
                  <td style={{ padding: '6px 12px' }}>
                    {row.imageUrl ? (
                      <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Done
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Current row editor */}
      {current && (
        <div className="card">
          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Row {currentIdx + 1} of {rows.length}</span>
              <span style={{ marginLeft: 12, fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{current.exerciseId}</span>
              <span style={{ marginLeft: 8, fontSize: 12, background: 'rgba(31,111,235,0.15)', color: 'var(--accent)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{current.level}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ padding: '5px 12px' }}
                disabled={currentIdx === 0} onClick={() => setCurrentIdx(i => i - 1)}>
                <ChevronLeft size={14} className="inline" /> Prev
              </button>
              <button className="btn btn-secondary" style={{ padding: '5px 12px' }}
                disabled={currentIdx === rows.length - 1} onClick={() => setCurrentIdx(i => i + 1)}>
                Next <ChevronRight size={14} className="inline" />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', alignItems: 'flex-start' }}>
            {/* Image uploader */}
            <div>
              <RowImageUploader
                key={currentIdx}
                existingUrl={current.imageUrl}
                onUploaded={handleImageUploaded}
              />
              {current.imageUrl && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  <CheckCircle size={12} className="inline mr-1" style={{ color: '#4ade80' }} />
                  {current.imageUrl}
                </div>
              )}
            </div>

            {/* Row data preview */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Row Data</p>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {Object.entries(current.data).filter(([k]) => k !== 'Image link from Cloudinary').map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: 180, verticalAlign: 'top' }}>{k}</td>
                        <td style={{ padding: '4px 8px', wordBreak: 'break-word' }}>{v || <span style={{ opacity: 0.3 }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stateful image uploader that tracks its own preview per row
function RowImageUploader({ existingUrl, onUploaded }: { existingUrl: string; onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(existingUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ url: string }>('/admin/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data.url);
      onUploaded(res.data.url);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Upload failed');
      setPreview(existingUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {preview ? 'Image (click to replace)' : 'Upload Image'}
      </p>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        style={{
          border: `2px dashed ${preview ? '#4ade8066' : 'var(--border)'}`,
          borderRadius: 12, cursor: 'pointer',
          background: 'var(--card-bg)',
          minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          overflow: 'hidden', position: 'relative',
        }}>
        {uploading ? (
          <><Loader2 size={28} className="animate-spin" style={{ color: '#60a5fa' }} /><span style={{ fontSize: 13, opacity: 0.6 }}>Uploading...</span></>
        ) : preview ? (
          <img src={preview} alt="preview" style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', padding: 8 }} />
        ) : (
          <><ImageIcon size={32} style={{ opacity: 0.3 }} /><span style={{ fontSize: 13, opacity: 0.5 }}>Click or drag & drop</span></>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image Labelling form (unchanged)
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
              }}>{i + 1}</div>
            ))}
          </div>
        )}
      </div>
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
            <input className="form-control" value={instructionFr} onChange={e => setInstructionFr(e.target.value)} placeholder="Etiquetez l'image" />
          </div>
        </div>
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
                <input className="form-control" style={{ flex: 2 }} placeholder="Label name" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                <input className="form-control" style={{ width: 70 }} type="number" min={0} max={1} step={0.01} value={item.x} onChange={e => updateItem(i, 'x', parseFloat(e.target.value) || 0)} />
                <input className="form-control" style={{ width: 70 }} type="number" min={0} max={1} step={0.01} value={item.y} onChange={e => updateItem(i, 'y', parseFloat(e.target.value) || 0)} />
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }} disabled={items.length === 1}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>X/Y are relative positions (0.0 = left/top, 1.0 = right/bottom).</p>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
        {success && <div className="alert" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', marginBottom: 8, borderRadius: 8, padding: '0.75rem 1rem' }}><CheckCircle size={14} style={{ marginRight: 6, display: 'inline' }} />{success}</div>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={16} style={{ marginRight: 6 }} />}
          {saving ? 'Saving...' : 'Save Exercise'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image MCQ form (unchanged)
// ---------------------------------------------------------------------------
interface MCQOption { text: string; english: string; }

function ImageMCQForm() {
  const [question, setQuestion] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [instructionEn, setInstructionEn] = useState('Which describes this image?');
  const [instructionFr, setInstructionFr] = useState('Quelle phrase decrit cette image ?');
  const [level, setLevel] = useState<string>('A1');
  const [imageUrl, setImageUrl] = useState('');
  const [options, setOptions] = useState<MCQOption[]>([
    { text: '', english: '' }, { text: '', english: '' },
    { text: '', english: '' }, { text: '', english: '' },
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
      <div style={{ flex: '0 0 300px' }}>
        <ImageUploader onUploaded={setImageUrl} />
        {imageUrl && <img src={imageUrl} alt="preview" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
      </div>
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
                <input type="radio" name="correct" checked={correctIndex === i} onChange={() => setCorrectIndex(i)}
                  style={{ cursor: 'pointer', accentColor: '#10b981', width: 16, height: 16, flexShrink: 0 }} />
                <input className="form-control" style={{ flex: 1 }} placeholder={`Option ${i + 1} (French)`} value={opt.text} onChange={e => updateOption(i, 'text', e.target.value)} />
                <input className="form-control" style={{ flex: 1 }} placeholder={`Option ${i + 1} (English)`} value={opt.english} onChange={e => updateOption(i, 'english', e.target.value)} />
                <button onClick={() => removeOption(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }} disabled={options.length <= 2}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Radio button marks the correct answer (currently: option {correctIndex + 1}).</p>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
        {success && <div className="alert" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', marginBottom: 8, borderRadius: 8, padding: '0.75rem 1rem' }}><CheckCircle size={14} style={{ marginRight: 6, display: 'inline' }} />{success}</div>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={16} style={{ marginRight: 6 }} />}
          {saving ? 'Saving...' : 'Save Exercise'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ImageExercises() {
  const [tab, setTab] = useState<'csv' | 'labelling' | 'mcq'>('csv');

  const tabs = [
    { id: 'csv' as const, label: 'CSV Bulk Upload', Icon: FileSpreadsheet },
    { id: 'labelling' as const, label: 'Image Labelling', Icon: Tag },
    { id: 'mcq' as const, label: 'Image Description (MCQ)', Icon: Image },
  ];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Image Exercises</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: 14 }}>Upload images for exercises via CSV or create individual exercises</p>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #333)', marginBottom: '1.5rem' }}>
        {tabs.map(({ id, label, Icon }) => (
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

      {tab === 'csv' && (
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>CSV Bulk Image Upload</h2>
          <p style={{ opacity: 0.5, fontSize: 13, marginBottom: '1.5rem' }}>
            Upload a CSV with exercise data (image column can be empty). Then upload images row by row using Prev/Next.
            Hit <strong>Save Progress</strong> at any time to save all rows that have images.
          </p>
          <CsvBulkUpload />
        </div>
      )}

      {tab === 'labelling' && (
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>Image Labelling</h2>
          <p style={{ opacity: 0.5, fontSize: 13, marginBottom: '1.5rem' }}>
            Upload an image and add numbered labels with X/Y positions. Students will match numbers to words.
          </p>
          <ImageLabellingForm />
        </div>
      )}

      {tab === 'mcq' && (
        <div className="card">
          <h2 style={{ marginBottom: '0.5rem' }}>Image Description (MCQ)</h2>
          <p style={{ opacity: 0.5, fontSize: 13, marginBottom: '1.5rem' }}>
            Upload an image, write a question, and provide multiple choice options.
          </p>
          <ImageMCQForm />
        </div>
      )}
    </div>
  );
}

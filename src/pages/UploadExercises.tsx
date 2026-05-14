import { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Settings } from 'lucide-react';
import api from '../services/api';

type UploadMode = 'exercises' | 'passages';

export default function UploadExercises() {
    const [mode, setMode] = useState<UploadMode>('exercises');
    const [file, setFile] = useState<File | null>(null);
    const [skill, setSkill] = useState('Reading');
    const [typeSlug, setTypeSlug] = useState('match_pairs');
    const [subtypeSlug, setSubtypeSlug] = useState('');
    const [category, setCategory] = useState('main');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean, message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            if (mode === 'passages') {
                const res = await api.post('/admin/sync/passages', formData);
                setResult({ success: true, message: res.data.message });
            } else {
                formData.append('skill', skill);
                formData.append('type_slug', typeSlug);
                formData.append('category', category);
                if (subtypeSlug.trim()) formData.append('subtype_slug', subtypeSlug.trim());
                const res = await api.post('/admin/sync/exercises', formData);
                setResult({ success: true, message: res.data.message });
            }
            setFile(null);
        } catch (err: any) {
            setResult({ success: false, message: err.response?.data?.detail || 'Upload failed' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Sync Exercises</h1>
            <p className="mb-8 text-muted">Import practice exercises from CSV with specific skill mapping.</p>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-8" style={{ borderBottom: '1px solid var(--border)' }}>
                {(['exercises', 'passages'] as UploadMode[]).map(m => (
                    <button
                        key={m}
                        onClick={() => { setMode(m); setResult(null); setFile(null); }}
                        className="btn btn-secondary"
                        style={{
                            borderRadius: '6px 6px 0 0',
                            borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
                            fontWeight: mode === m ? 600 : 400,
                            textTransform: 'capitalize',
                        }}
                    >
                        {m === 'passages' ? 'Passages CSV' : 'Exercises CSV'}
                    </button>
                ))}
            </div>

            {mode === 'passages' && (
                <div className="card mb-8" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        <strong>Step 1 of 2 — Upload the image/scenario file first.</strong><br /><br />
                        <strong>Running Conversation:</strong> Upload <code>Running-conversation.csv</code> here, then upload <code>Running-conversation(2).csv</code> in Exercises CSV with <code>type_slug = conversation_dialogue</code>.<br /><br />
                        <strong>Image Labelling:</strong> Upload an image-map CSV here (columns: <code>ExerciseID</code>, <code>Image link from Cloudinary</code>, <code>Marker_1_X</code>, <code>Marker_1_Y</code> ... <code>Marker_8_X</code>, <code>Marker_8_Y</code>), then upload the labels CSV in Exercises CSV with <code>type_slug = image_labelling</code>.<br /><br />
                        The backend merges both files automatically using the shared <code>ExerciseID</code>.
                    </p>
                </div>
            )}

            {mode === 'exercises' && (
                <div className="grid grid-2 gap-2 mb-8">
                    <div className="form-group">
                        <label className="form-label">Skill</label>
                        <select className="form-control" value={skill} onChange={(e) => setSkill(e.target.value)}>
                            <option>Reading</option>
                            <option>Writing</option>
                            <option>Listening</option>
                            <option>Speaking</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Category</label>
                        <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                            <option value="main">Main (Default)</option>
                            <option value="vocabulary">Vocabulary</option>
                            <option value="grammar">Grammar</option>
                        </select>
                    </div>
                </div>
            )}

            {mode === 'exercises' && (
                <div className="form-group mb-8">
                    <label className="form-label">Question Type Slug</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="form-control"
                            value={typeSlug}
                            onChange={(e) => setTypeSlug(e.target.value)}
                            placeholder="e.g. match_pairs, passage_mcq..."
                        />
                        <button className="btn btn-secondary bg-card-bg border border-border" onClick={() => setTypeSlug('')}>
                            <Settings size={18} />
                        </button>
                    </div>
                </div>
            )}

            {mode === 'exercises' && (
                <div className="form-group mb-8">
                    <label className="form-label">
                        Subtype Slug <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional — leave blank to auto-assign)</span>
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        value={subtypeSlug}
                        onChange={(e) => setSubtypeSlug(e.target.value)}
                        placeholder="e.g. passage_mcq_default, b1_reading_set2..."
                    />
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Set this when uploading a new batch that should be separate from existing exercises of the same type.
                    </p>
                </div>
            )}

            <div className="card">
                <div
                    className="file-upload-zone"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".csv"
                        className="hidden"
                        style={{ display: 'none' }}
                    />
                    <Upload className="file-upload-icon" />
                    <div className="file-upload-text">
                        {file ? file.name : `Click to select or drag and drop your ${mode === 'passages' ? 'passages' : 'exercise'} CSV`}
                    </div>
                    {file && <div className="file-info"><FileSpreadsheet className="inline" /> {(file.size / 1024).toFixed(2)} KB</div>}
                </div>

                {result && (
                    <div className={`alert ${result.success ? 'alert-success' : 'alert-error'}`}>
                        {result.success ? <CheckCircle2 className="inline mr-2" /> : <AlertCircle className="inline mr-2" />}
                        {result.message}
                    </div>
                )}

                <button
                    className="btn btn-primary w-full justify-center"
                    disabled={!file || loading}
                    onClick={handleUpload}
                >
                    {loading ? 'Processing...' : mode === 'passages' ? 'Import Passages' : 'Import Exercises'}
                </button>
            </div>
        </div>
    );
}

import { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Settings } from 'lucide-react';
import api from '../services/api';

export default function UploadExercises() {
    const [file, setFile] = useState<File | null>(null);
    const [skill, setSkill] = useState('Reading');
    const [typeSlug, setTypeSlug] = useState('match_pairs');
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
        formData.append('skill', skill);
        formData.append('type_slug', typeSlug);
        formData.append('category', category);

        try {
            const res = await api.post('/admin/sync/exercises', formData);
            setResult({ success: true, message: res.data.message });
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
                        {file ? file.name : 'Click to select or drag and drop your exercise CSV'}
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
                    {loading ? 'Processing...' : 'Import Exercises'}
                </button>
            </div>
        </div>
    );
}

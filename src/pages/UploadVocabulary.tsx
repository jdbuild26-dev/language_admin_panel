import { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import api from '../services/api';

export default function UploadVocabulary() {
    const [file, setFile] = useState<File | null>(null);
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
            const res = await api.post('/admin/sync/vocabulary', formData);
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
            <h1>Sync Vocabulary</h1>
            <p className="mb-8 text-muted">Upload your Vocabulary Master Bank CSV to update the database.</p>

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
                        {file ? file.name : 'Click to select or drag and drop your CSV file'}
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
                    {loading ? 'Processing...' : 'Start Synchronization'}
                </button>
            </div>

            <div className="card bg-black/20">
                <h3 className="mb-4">Expected CSV Structure</h3>
                <ul className="text-sm space-y-2 opacity-70">
                    <li>• <b>Unique ID</b>: Numeric or string ID</li>
                    <li>• <b>English Word</b>: Native translation</li>
                    <li>• <b>Masculine, Feminine, No Gender</b>: French forms</li>
                    <li>• <b>Category, Sub Category, Gender, Grammar</b>: Metadata</li>
                    <li>• <b>French Sentence, English Sentence</b>: Examples</li>
                </ul>
            </div>
        </div>
    );
}

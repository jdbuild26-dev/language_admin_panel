import { useEffect, useState } from 'react';
import { Package, FileText, Blocks, Tag } from 'lucide-react';
import api from '../services/api';

interface Stats {
    vocabulary_count: number;
    exercise_count: number;
    question_types: Record<string, number>;
    categories: Record<string, number>;
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);

    useEffect(() => {
        api.get<Stats>('/admin/stats')
            .then(res => setStats(res.data))
            .catch((err: any) => console.error(err));
    }, []);

    if (!stats) return <div className="text-center p-10">Loading insights...</div>;

    return (
        <div>
            <h1>Admin Dashboard</h1>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Vocabulary</div>
                    <div className="stat-value"><Package className="inline mr-2 text-primary" /> {stats.vocabulary_count}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Exercises</div>
                    <div className="stat-value"><FileText className="inline mr-2 text-primary" /> {stats.exercise_count}</div>
                </div>
            </div>

            <div className="grid grid-2 gap-2">
                <div className="card">
                    <h2><Blocks className="inline mr-2" /> Question Types</h2>
                    <div className="space-y-2">
                        {Object.entries(stats.question_types).map(([type, count]) => (
                            <div key={type} className="flex justify-between items-center p-2 rounded hover:bg-black/10">
                                <span>{type}</span>
                                <span className="badge badge-success">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <h2><Tag className="inline mr-2" /> Categories</h2>
                    <div className="space-y-2">
                        {Object.entries(stats.categories).map(([cat, count]) => (
                            <div key={cat} className="flex justify-between items-center p-2 rounded hover:bg-black/10">
                                <span>{cat}</span>
                                <span className="badge badge-success">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ScrollText, Rocket, MessageSquare } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import UploadVocabulary from './pages/UploadVocabulary';
import UploadExercises from './pages/UploadExercises';
import PromptsEditor from './pages/PromptsEditor';

function App() {
  return (
    <Router>
      <div className="sidebar">
        <div className="logo">
          <Rocket size={32} strokeWidth={2.5} />
          <span>Langlearn</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/vocabulary" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={20} />
            Vocabulary
          </NavLink>
          <NavLink to="/exercises" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <ScrollText size={20} />
            Exercises
          </NavLink>
          <NavLink to="/prompts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <MessageSquare size={20} />
            AI Prompts
          </NavLink>
        </nav>
      </div>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vocabulary" element={<UploadVocabulary />} />
          <Route path="/exercises" element={<UploadExercises />} />
          <Route path="/prompts" element={<PromptsEditor />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;

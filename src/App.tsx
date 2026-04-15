import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ScrollText, Rocket, MessageSquare, ImageIcon, BookMarked, Filter, Dumbbell } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import UploadVocabulary from './pages/UploadVocabulary';
import UploadExercises from './pages/UploadExercises';
import PromptsEditor from './pages/PromptsEditor';
import ImageExercises from './pages/ImageExercises';
import ReadingExercises from './pages/ReadingExercises';
import TagTopics from './pages/TagTopics';
import MainPractice from './pages/MainPractice';

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
          <NavLink to="/main-practice" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Dumbbell size={20} />
            Main Practice
          </NavLink>
          <NavLink to="/exercises" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <ScrollText size={20} />
            Exercises
          </NavLink>
          <NavLink to="/reading-exercises" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookMarked size={20} />
            Reading Exercises
          </NavLink>
          <NavLink to="/tag-topics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Filter size={20} />
            Tag Topics
          </NavLink>
          <NavLink to="/image-exercises" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <ImageIcon size={20} />
            Image Exercises
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
          <Route path="/main-practice" element={<MainPractice />} />
          <Route path="/exercises" element={<UploadExercises />} />
          <Route path="/reading-exercises" element={<ReadingExercises />} />
          <Route path="/tag-topics" element={<TagTopics />} />
          <Route path="/image-exercises" element={<ImageExercises />} />
          <Route path="/prompts" element={<PromptsEditor />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
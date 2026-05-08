import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, BookText, Dumbbell, BookMarked, MessageSquare, FileText, Upload } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import UploadVocabulary from './pages/UploadVocabulary';
import UploadExercises from './pages/UploadExercises';
import PromptsEditor from './pages/PromptsEditor';
import ReadingExercises from './pages/ReadingExercises';
import TagTopics from './pages/TagTopics';
import MainPractice from './pages/MainPractice';
import VocabularyEditor from './pages/VocabularyEditor';
import GrammarPractice from './pages/GrammarPractice';
import Grammar from './pages/Grammar';
import Stories from './pages/Stories';
import StoryUploadPage from './pages/StoryUploadPage';

function App() {
  return (
    <Router>
      <div className="sidebar">
        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/vocabulary" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={20} />
            Vocabulary
          </NavLink>
          <NavLink to="/grammar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookText size={20} />
            Grammar
          </NavLink>
          <NavLink to="/grammar-practice" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Dumbbell size={20} />
            Grammar Practice
          </NavLink>
          <NavLink to="/main-practice" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Dumbbell size={20} />
            Main Practice
          </NavLink>
          <NavLink to="/exercises" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Upload size={20} />
            Upload Exercises
          </NavLink>
          <NavLink to="/stories" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookMarked size={20} />
            Stories
          </NavLink>
          <NavLink to="/stories/upload" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Upload size={20} />
            Story Upload
          </NavLink>
          <NavLink to="/ai-practice" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <MessageSquare size={20} />
            AI Practice
          </NavLink>
          <NavLink to="/blog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <FileText size={20} />
            Blog
          </NavLink>
        </nav>
      </div>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vocabulary" element={<UploadVocabulary />} />
          <Route path="/vocabulary-editor" element={<VocabularyEditor />} />
          <Route path="/grammar" element={<Grammar />} />
          <Route path="/grammar-practice" element={<GrammarPractice />} />
          <Route path="/main-practice" element={<MainPractice />} />
          <Route path="/exercises" element={<UploadExercises />} />
          <Route path="/reading-exercises" element={<ReadingExercises />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/stories/upload" element={<StoryUploadPage />} />
          <Route path="/tag-topics" element={<TagTopics />} />

          <Route path="/ai-practice" element={<PromptsEditor />} />
          <Route path="/prompts" element={<PromptsEditor />} />
          <Route path="/blog" element={<Dashboard />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
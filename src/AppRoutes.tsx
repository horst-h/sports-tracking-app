import { Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import AnalyzePage from './pages/AnalyzePage'
import GoalsPage from './pages/GoalsPage'

export default function AppRoutes() {
  return (
    <Routes>
      {/* Dashboard: sport switcher, cards, drawer */}
      <Route path="/" element={<App />} />
      
      {/* Analyze: detailed metrics & narrative insights */}
      <Route path="/analyze/:sport/:metric" element={<AnalyzePage />} />

      {/* Goals: unified page per sport with all goal categories */}
      <Route path="/goals" element={<Navigate to="/goals/run" replace />} />
      <Route path="/goals/:sport" element={<GoalsPage />} />
      
      {/* Catch-all: 404 fallback to home */}
      <Route path="*" element={<App />} />
    </Routes>
  )
}

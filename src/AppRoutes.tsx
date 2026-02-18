import { Routes, Route } from 'react-router-dom'
import App from './App'
import AnalyzePage from './pages/AnalyzePage'
import GoalsOverviewPage from './pages/GoalsOverviewPage'
import GoalEditPage from './pages/GoalEditPage'

export default function AppRoutes() {
  return (
    <Routes>
      {/* Dashboard: sport switcher, cards, drawer */}
      <Route path="/" element={<App />} />
      
      {/* Analyze: detailed metrics & narrative insights */}
      <Route path="/analyze/:sport/:metric" element={<AnalyzePage />} />

      {/* Goals: overview + per-metric edit */}
      <Route path="/goals" element={<GoalsOverviewPage />} />
      <Route path="/goals/:sport/:metric" element={<GoalEditPage />} />
      
      {/* Catch-all: 404 fallback to home */}
      <Route path="*" element={<App />} />
    </Routes>
  )
}

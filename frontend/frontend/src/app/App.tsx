import { Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../features/auth/AuthContext'
import { LoginPage } from '../features/auth/LoginPage'
import { DashboardLayout } from '../features/clinic/DashboardLayout'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { PublicPage } from '../features/public/PublicPage'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<PublicPage page="home" />} />
        <Route path="/about" element={<PublicPage page="about" />} />
        <Route path="/mission" element={<PublicPage page="mission" />} />
        <Route path="/vision" element={<PublicPage page="vision" />} />
        <Route path="/services" element={<PublicPage page="services" />} />
        <Route path="/contact" element={<PublicPage page="contact" />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}

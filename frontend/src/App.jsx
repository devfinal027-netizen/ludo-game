import { Outlet } from 'react-router-dom'
import Header from './components/Header'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header />
      <main className="container mx-auto p-6">
        <h1 className="text-2xl font-semibold">Ludo Frontend Scaffold</h1>
        <p className="text-gray-500 mt-2">Tailwind + React + Vite is configured.</p>
        <div className="mt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { MainMapPage } from '@/pages/MainMapPage'
import { SectionPage } from '@/pages/SectionPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<MainMapPage />} />
          <Route path="section/:id" element={<SectionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

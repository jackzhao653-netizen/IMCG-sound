import { Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import TTS from '@/pages/TTS'
import SoundProfileLibrary from '@/pages/SoundProfileLibrary'
import Library from '@/pages/Library'
import ProfileGenerator from '@/pages/ProfileGenerator'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<TTS />} />
        <Route path="/tts" element={<TTS />} />
        <Route path="/music" element={<SoundProfileLibrary />} />
        <Route path="/library" element={<Library />} />
        <Route path="/profiles" element={<ProfileGenerator />} />
      </Route>
    </Routes>
  )
}

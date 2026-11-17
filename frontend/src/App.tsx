import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { AdminPanel } from "./pages/AdminPanel";
import { Dashboard } from "./pages/Dashboard";
import { Leaderboards } from "./pages/Leaderboards";
import { Methodology } from "./pages/Methodology";
import { StudentProfile } from "./pages/StudentProfile";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#201f20]">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/student/:rollNumber" element={<StudentProfile />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

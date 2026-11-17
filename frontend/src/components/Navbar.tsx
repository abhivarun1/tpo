import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { BookOpen, LayoutDashboard, Menu, Search, Shield, Trophy, X } from "lucide-react";
import { searchStudents } from "../api/client";
import type { StudentSummary } from "../types";
import { BrandLogo } from "./BrandLogo";
import { CoverageBadge } from "./CoverageBadge";

export function Navbar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Keyboard shortcut Cmd+K or Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await searchStudents(q, 8);
        setResults(items);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (roll: string) => {
    setOpen(false);
    setQuery("");
    setMobileMenuOpen(false);
    navigate(`/student/${encodeURIComponent(roll)}`);
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
      isActive
        ? "bg-[#f7f6f6] text-[#201f20] border border-[#e0e0df]"
        : "text-[#494949] hover:text-[#201f20] hover:bg-[#f7f6f6] border border-transparent"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-[#ffffff] border-b border-[#e0e0df]">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <BrandLogo className="w-7 h-7 shrink-0 transition-transform group-hover:scale-105" />
            <div className="flex items-center">
              <span className="text-lg font-semibold tracking-tight text-[#201f20] group-hover:text-[#2e5bff] transition-colors">
                Teddy Ranks
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </NavLink>
            <NavLink to="/leaderboards" className={navLinkClass}>
              <Trophy className="w-3.5 h-3.5" />
              Leaderboards
            </NavLink>
            <NavLink to="/methodology" className={navLinkClass}>
              <BookOpen className="w-3.5 h-3.5" />
              Methodology
            </NavLink>
            <NavLink to="/admin" className={navLinkClass}>
              <Shield className="w-3.5 h-3.5" />
              Admin
            </NavLink>
          </nav>
        </div>

        {/* Search Bar / Trigger */}
        <div ref={boxRef} className="relative flex-1 max-w-sm hidden sm:block">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#606060] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => query.trim() && setOpen(true)}
              placeholder="Search student or roll (⌘K)..."
              className="w-full bg-[#f7f6f6] border border-[#e0e0df] focus:border-[#2e5bff] focus:bg-[#ffffff] focus:ring-1 focus:ring-[#2e5bff]/20 rounded-full pl-9 pr-8 py-1.5 text-sm text-[#201f20] placeholder-[#606060] outline-none transition-all"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#606060] hover:text-[#201f20]"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden lg:inline-block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-[#606060] bg-[#ffffff] border border-[#e0e0df] rounded">
                ⌘K
              </kbd>
            )}
          </div>

          {open && query.trim() && (
            <div className="absolute right-0 left-0 mt-2 bg-[#ffffff] border border-[#e0e0df] rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-3 text-xs text-[#606060]">Searching database...</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-3 text-xs text-[#606060]">No student match for "{query}"</div>
              ) : (
                <ul className="divide-y divide-[#e0e0df]">
                  {results.map((s) => (
                    <li key={s.roll_number}>
                      <button
                        type="button"
                        onClick={() => handleSelect(s.roll_number)}
                        className="w-full px-4 py-2.5 text-left hover:bg-[#f7f6f6] flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#201f20] truncate">{s.name}</div>
                          <div className="text-xs text-[#606060] font-mono flex items-center gap-2 mt-0.5">
                            <span>{s.display_roll_number}</span>
                            <span>•</span>
                            <span>{s.batch}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CoverageBadge coverage={s.profile_coverage} rankingStatus={s.ranking_status} />
                          <span className="text-xs font-mono font-medium text-[#2e5bff]">
                            {s.overall_college_rank ? `#${s.overall_college_rank}` : "Unranked"}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-[#494949] hover:text-[#201f20] hover:bg-[#f7f6f6]"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#e0e0df] bg-[#ffffff] px-6 py-4 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#606060] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              placeholder="Search student or roll..."
              className="w-full bg-[#f7f6f6] border border-[#e0e0df] focus:border-[#2e5bff] rounded-full pl-9 pr-4 py-2 text-sm text-[#201f20] placeholder-[#606060] outline-none"
            />
          </div>

          <nav className="flex flex-col gap-1 pt-2">
            <NavLink
              to="/"
              end
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-[#f7f6f6] text-[#201f20] font-semibold" : "text-[#494949]"
                }`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/leaderboards"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-[#f7f6f6] text-[#201f20] font-semibold" : "text-[#494949]"
                }`
              }
            >
              Leaderboards
            </NavLink>
            <NavLink
              to="/methodology"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-[#f7f6f6] text-[#201f20] font-semibold" : "text-[#494949]"
                }`
              }
            >
              Methodology
            </NavLink>
            <NavLink
              to="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-[#f7f6f6] text-[#201f20] font-semibold" : "text-[#494949]"
                }`
              }
            >
              Admin
            </NavLink>
          </nav>
        </div>
      )}
    </header>
  );
}

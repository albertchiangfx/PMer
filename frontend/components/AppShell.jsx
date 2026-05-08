'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: IconGrid },
  { href: '/projects', label: '專案', icon: IconFolder },
  { href: '/team', label: '成員', icon: IconUsers },
  { href: '/contracts', label: '合約', icon: IconDoc },
  { href: '/invoices', label: '發票', icon: IconReceipt },
];

export default function AppShell({ children }) {
  const path = usePathname();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [viewerTitle, setViewerTitle] = useState('');
  const [viewerRole, setViewerRole] = useState('');
  const [navHover, setNavHover] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sp.navCollapsed');
      if (saved === '1') setNavCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const name = localStorage.getItem('sp.viewerMemberName') || '';
      const role = localStorage.getItem('sp.viewerMemberRole') || '';
      const title = name || '';
      setViewerTitle(title);
      setViewerRole(role || '');
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    setNavCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('sp.navCollapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Hover-to-expand behavior: when collapsed, hovering the left nav reveals the full sidebar.
  const showSidebar = !navCollapsed || navHover;
  const showRail = navCollapsed && !navHover;

  return (
    <div className="app-bg app-blobs min-h-screen text-slate-900">
      <div className="relative z-[1] mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="shell relative flex min-h-[720px] w-full overflow-hidden rounded-[28px]">
          <div
            className="relative self-stretch"
            onMouseEnter={() => setNavHover(true)}
            onMouseLeave={() => setNavHover(false)}
          >
            {/* icon rail (only when collapsed and not hovering) */}
            <aside
              className={[
                'hidden sm:flex w-[74px] shrink-0 flex-col items-center gap-4 bg-[#111827] py-5 text-white/80 h-full',
                showRail ? '' : 'sm:hidden',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={toggleCollapsed}
                className="mt-1 h-9 w-9 rounded-2xl bg-white/10 ring-1 ring-white/10 grid place-items-center hover:bg-white/15 transition"
                aria-label="展開導覽"
                title="展開導覽"
              >
                <span className="h-5 w-5"><IconExpand /></span>
              </button>
              <span className="text-[10px] font-semibold text-white/55 -mt-2">MENU</span>

              <div className="mt-2 flex flex-col gap-3">
                <RailIcon active={path === '/'} href="/" label="Dashboard"><IconGrid /></RailIcon>
                <RailIcon active={path.startsWith('/projects')} href="/projects" label="專案"><IconFolder /></RailIcon>
                <RailIcon active={path.startsWith('/team')} href="/team" label="成員"><IconUsersMini /></RailIcon>
                <RailIcon active={path.startsWith('/contracts')} href="/contracts" label="合約"><IconDocMini /></RailIcon>
                <RailIcon active={path.startsWith('/invoices')} href="/invoices" label="發票"><IconReceiptMini /></RailIcon>
              </div>

              <div className="mt-auto pb-2">
                <RailIcon href="/settings" active={path.startsWith('/settings')} label="設定"><IconGear /></RailIcon>
              </div>
            </aside>

            {/* sidebar (show when expanded OR hovered while collapsed) */}
            <aside
              className={[
                'w-[280px] shrink-0 border-r border-white/10 bg-[#111827] px-5 py-6 text-white/85 hidden md:block h-full',
                showSidebar ? '' : 'md:hidden',
              ].join(' ')}
            >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/10 ring-1 ring-white/10 grid place-items-center">
                <span className="text-xs font-semibold text-white/90">SP</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white/90">{viewerTitle || 'Studio PM'}</p>
                <p className="truncate text-xs text-white/55">{viewerRole || '3D Animation'}</p>
              </div>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="ml-auto h-9 w-9 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white/80 hover:bg-white/15 transition"
                aria-label="收合導覽"
                title="收合導覽"
              >
                <span className="h-5 w-5"><IconCollapse /></span>
              </button>
            </div>

            <div className="mt-6 flex h-[calc(100%-56px)] flex-col">
              <p className="text-[11px] font-semibold tracking-wide text-white/45">Navigation</p>
              <div className="mt-3 space-y-3">
                {NAV.map((n) => {
                  const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
                  const Icon = n.icon;
                  return (
                    <SidebarLink key={n.href} href={n.href} label={n.label} active={active} icon={<Icon />} dark />
                  );
                })}
              </div>

              <div className="mt-auto pt-4">
                <SidebarLink href="/settings" label="設定" active={path.startsWith('/settings')} icon={<IconGear />} dark />
              </div>
            </div>
          </aside>
          </div>

          {/* content */}
          <main className="relative flex-1 px-5 py-6 sm:px-8 sm:py-8 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function RailIcon({ children, href, active, label }) {
  return (
    <Link
      aria-label={label}
      href={href}
      className={[
        'h-11 w-11 rounded-2xl grid place-items-center transition',
        active ? 'bg-white/12 ring-1 ring-white/15 text-white' : 'hover:bg-white/10 text-white/75',
      ].join(' ')}
    >
      <span className="h-5 w-5">{children}</span>
    </Link>
  );
}

function SidebarLink({ href, label, icon, active, dark }) {
  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition',
        dark
          ? active
            ? 'bg-white/12 text-white ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
            : 'bg-white/0 text-white/80 hover:bg-white/10'
          : active
            ? 'bg-white/70 ring-1 ring-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] text-slate-900'
            : 'bg-white/35 ring-1 ring-white/50 text-slate-700 hover:bg-white/55',
      ].join(' ')}
    >
      <span className={dark ? 'text-white/65' : 'text-slate-500'}>{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5V21a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 21V10.5Z" />
      <path d="M9.5 22.5V14a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v8.5" />
    </svg>
  );
}
function IconStack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
      <path d="M3.5 12 12 16.5 20.5 12" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </svg>
  );
}
function IconUsersMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M16 21c0-2.5-2-4.5-4.5-4.5S7 18.5 7 21" />
      <path d="M12 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    </svg>
  );
}
function IconReceiptMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function IconDocMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 4h7v7H4V4Z" />
      <path d="M13 4h7v7h-7V4Z" />
      <path d="M4 13h7v7H4v-7Z" />
      <path d="M13 13h7v7h-7v-7Z" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M7 2v4" />
      <path d="M17 2v4" />
      <path d="M3 9h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M16 21c0-2.5-2-4.5-4.5-4.5S7 18.5 7 21" />
      <path d="M12 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <path d="M14 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
      <path d="M4 12h2" />
      <path d="M10 12h10" />
      <path d="M6 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
      <path d="M4 18h10" />
      <path d="M18 18h2" />
      <path d="M14 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
    </svg>
  );
}

function IconCollapse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M20 12H8" />
      <path d="M12 6l-6 6 6 6" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 12h12" />
      <path d="M12 6l6 6-6 6" />
    </svg>
  );
}


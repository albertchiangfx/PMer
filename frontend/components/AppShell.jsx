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

/**
 * Knobs for the floating left nav. All values are Tailwind class strings
 * (literals so the JIT scanner can find them). Edit a value here and the
 * dev server (http://localhost:3000) will hot-reload.
 *
 * Both NavRail (collapsed, icon-only) and NavSidebar (expanded, with labels)
 * read the same constants so the two states always stay in sync.
 */
const NAV_STYLE = {
  // ── Widths ───────────────────────────────────────────────
  /** Collapsed icon-rail width. */
  railWidth: 'w-[74px]',
  /** Expanded sidebar width (hover or pinned). */
  sidebarWidth: 'w-[242px]',

  // ── Outer plaster (light) cards ──────────────────────────
  /** Top plaster card corner radius. */
  topCardRadius: 'rounded-[12px]',
  /** Bottom (settings) plaster card corner radius. */
  bottomCardRadius: 'rounded-[12px]',
  /** Padding between plaster outer and dark inner pill (per side). */
  cardPadding: 'p-2',
  /** Vertical gap between the top and bottom plaster cards. */
  cardGap: 'gap-2',
  /** Top : Bottom plaster height ratio. Tailwind arbitrary flex syntax:
   *  [flex:GROW_SHRINK_BASIS]. Default 7:3. */
  topFlex: '[flex:6.18_0_0]',
  bottomFlex: '[flex:3.82_0_0]',

  // ── Inner dark pills ─────────────────────────────────────
  /** Top dark pill (icons / nav rows) corner radius. */
  topPillRadius: 'rounded-[8px]',
  /** Bottom dark pod (settings) corner radius. */
  bottomPillRadius: 'rounded-[8px]',
  /** How far the top pill visibly extends past the last item.
   *  Used as bottom-padding on the top dark pill.
   *  Any Tailwind padding works:
   *    - preset scale (every 4px): pb-12 (48px), pb-20 (80px), pb-40 (160px)…
   *    - arbitrary value: pb-[33px], pb-[100px], pb-[5rem]
   *  Same for cardPadding / cardGap / radii / widths above. */
  pillTailPad: 'pb-28',

  // ── Colors ───────────────────────────────────────────────
  // Deep theme colors (plaster card bg, dark pill bg, divider) live in
  // frontend/app/globals.css :root as CSS variables (--nav-plaster-from /
  // --nav-plaster-to / --nav-pill-bg / --nav-divider). Edit those there.
  // The Tailwind-class colors below cover everything that sits on top.

  /** Brand "SP" button background (Tailwind gradient). */
  brandBg: 'bg-gradient-to-br from-indigo-500 to-purple-600',
  /** Brand "SP" button drop shadow (uses brand color). */
  brandShadow: 'shadow-[0_2px_6px_rgba(79,70,229,0.45)]',
  /** Left-edge accent bar shown on the active nav item. */
  activeAccent: 'bg-indigo-400/90',
  /** Active item background + ring inside the dark pill. */
  activeBg: 'bg-white/10 ring-1 ring-white/15',
  /** Inactive item text color (icon + label). */
  itemTextDim: 'text-white/55',
  /** Active item text color. */
  itemTextActive: 'text-white',
  /** Hover background applied to non-active items. */
  itemBgHover: 'hover:bg-white/[0.06]',
  /** Hover text color applied to non-active items. */
  itemTextHover: 'hover:text-white/90',
};

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
      <div className="relative z-[1] mx-auto w-full max-w-[min(1600px,calc(100vw-24px))] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex min-h-[720px] w-full gap-4 sm:gap-5">
          {/* Floating two-layer nav (separated from main content). */}
          <div
            className="hidden sm:flex shrink-0 flex-col self-stretch relative z-30"
            onMouseEnter={() => setNavHover(true)}
            onMouseLeave={() => setNavHover(false)}
          >
            {showRail ? (
              <NavRail path={path} onExpand={toggleCollapsed} />
            ) : (
              <NavSidebar
                path={path}
                onCollapse={toggleCollapsed}
                viewerTitle={viewerTitle}
                viewerRole={viewerRole}
                navItems={NAV}
              />
            )}
          </div>

          {/* Content shell — flex min-h-0 讓捲動發生在 main，避免子頁面按鈕點擊命中異常 */}
          <div className="shell relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-[28px]">
            <main className="relative flex-1 min-h-0 px-5 py-6 sm:px-8 sm:py-8 overflow-y-auto overflow-x-hidden overscroll-contain">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Collapsed icon rail. Two SEPARATE plaster cards, each with its own dark
 *  pill inside. Top plaster card height : Bottom plaster card height ≈ 7:3
 *  (enforced via flex grow ratios; min-h-fit lets the top card grow beyond
 *  70% if the icon pill needs more room on short pages). */
function NavRail({ path, onExpand }) {
  return (
    <div className={`flex flex-1 flex-col ${NAV_STYLE.railWidth} ${NAV_STYLE.cardGap}`}>
      {/* TOP plaster card. Dark pill flush to top edge with extra bottom
          padding (NAV_STYLE.pillTailPad) so it extends past the last icon. */}
      <div className={`nav-plaster flex flex-col min-h-fit ${NAV_STYLE.topCardRadius} ${NAV_STYLE.cardPadding} ${NAV_STYLE.topFlex}`}>
        <div className={`nav-pill flex flex-col items-center gap-1 pt-3 ${NAV_STYLE.topPillRadius} ${NAV_STYLE.pillTailPad}`}>
          <button
            type="button"
            onClick={onExpand}
            className={`h-10 w-10 rounded-[12px] grid place-items-center text-white hover:brightness-110 ${NAV_STYLE.brandBg} ${NAV_STYLE.brandShadow}`}
            aria-label="展開導覽"
            title="展開導覽"
          >
            <span className="text-[11px] font-bold tracking-wide">SP</span>
          </button>
          <div className="nav-divider w-[44px]" />
          <RailItem active={path === '/'} href="/" label="Dashboard"><IconGrid /></RailItem>
          <RailItem active={path.startsWith('/projects')} href="/projects" label="專案"><IconFolder /></RailItem>
          <div className="nav-divider w-[44px]" />
          <RailItem active={path.startsWith('/team')} href="/team" label="成員"><IconUsersMini /></RailItem>
          <RailItem active={path.startsWith('/contracts')} href="/contracts" label="合約"><IconDocMini /></RailItem>
          <RailItem active={path.startsWith('/invoices')} href="/invoices" label="發票"><IconReceiptMini /></RailItem>
        </div>
      </div>

      {/* BOTTOM plaster card. Dark pod anchored to bottom edge. */}
      <div className={`nav-plaster flex flex-col min-h-fit ${NAV_STYLE.bottomCardRadius} ${NAV_STYLE.cardPadding} ${NAV_STYLE.bottomFlex}`}>
        <div className={`nav-pill grid place-items-center py-1.5 mt-auto ${NAV_STYLE.bottomPillRadius}`}>
          <RailItem href="/settings" active={path.startsWith('/settings')} label="設定"><IconGear /></RailItem>
        </div>
      </div>
    </div>
  );
}

/** Expanded sidebar with labels. Same two-card / 7:3 split as NavRail. */
function NavSidebar({ path, onCollapse, viewerTitle, viewerRole, navItems }) {
  return (
    <div className={`flex flex-1 flex-col ${NAV_STYLE.sidebarWidth} ${NAV_STYLE.cardGap}`}>
      {/* TOP plaster card. Dark pill flush to top edge with extra bottom
          padding (NAV_STYLE.pillTailPad) so it extends past the last nav row. */}
      <div className={`nav-plaster flex flex-col min-h-fit ${NAV_STYLE.topCardRadius} ${NAV_STYLE.cardPadding} ${NAV_STYLE.topFlex}`}>
        <div className={`nav-pill flex flex-col px-3 pt-4 text-white/85 ${NAV_STYLE.topPillRadius} ${NAV_STYLE.pillTailPad}`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-[12px] grid place-items-center text-white text-[11px] font-bold tracking-wide ${NAV_STYLE.brandBg} ${NAV_STYLE.brandShadow}`}>
              SP
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white/95">{viewerTitle || 'Studio PM'}</p>
              <p className="truncate text-[11px] text-white/55">{viewerRole || '3D Animation'}</p>
            </div>
            <button
              type="button"
              onClick={onCollapse}
              className="h-8 w-8 rounded-[10px] bg-white/[0.08] ring-1 ring-white/10 grid place-items-center text-white/75 hover:bg-white/[0.12] hover:text-white transition-apple"
              aria-label="收合導覽"
              title="收合導覽"
            >
              <span className="h-4 w-4"><IconCollapse /></span>
            </button>
          </div>

          <p className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-white/40">NAVIGATION</p>
          <div className="mt-2 flex flex-col gap-1">
            {navItems.map((n) => {
              const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
              const Icon = n.icon;
              return (
                <SidebarLink key={n.href} href={n.href} label={n.label} active={active} icon={<Icon />} />
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM plaster card. Dark pod anchored to bottom edge. */}
      <div className={`nav-plaster flex flex-col min-h-fit ${NAV_STYLE.bottomCardRadius} ${NAV_STYLE.cardPadding} ${NAV_STYLE.bottomFlex}`}>
        <div className={`nav-pill px-2 py-1.5 mt-auto ${NAV_STYLE.bottomPillRadius}`}>
          <SidebarLink href="/settings" label="設定" active={path.startsWith('/settings')} icon={<IconGear />} />
        </div>
      </div>
    </div>
  );
}

/** Single icon button used inside the dark pill (collapsed rail). */
function RailItem({ children, href, active, label }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={[
        'relative h-10 w-10 rounded-[12px] grid place-items-center transition-apple',
        active
          ? `${NAV_STYLE.activeBg} ${NAV_STYLE.itemTextActive} shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]`
          : `${NAV_STYLE.itemTextDim} ${NAV_STYLE.itemBgHover} ${NAV_STYLE.itemTextHover}`,
      ].join(' ')}
    >
      {active && (
        <span className={`absolute left-[3px] top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full ${NAV_STYLE.activeAccent}`} />
      )}
      <span className="h-[18px] w-[18px]">{children}</span>
    </Link>
  );
}

function SidebarLink({ href, label, icon, active }) {
  return (
    <Link
      href={href}
      className={[
        'relative flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13px] transition-apple',
        active
          ? `${NAV_STYLE.activeBg} ${NAV_STYLE.itemTextActive} shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]`
          : `${NAV_STYLE.itemTextDim} ${NAV_STYLE.itemBgHover} ${NAV_STYLE.itemTextHover}`,
      ].join(' ')}
    >
      {active && (
        <span className={`absolute left-[5px] top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full ${NAV_STYLE.activeAccent}`} />
      )}
      <span className={active ? NAV_STYLE.itemTextActive : NAV_STYLE.itemTextDim}>{icon}</span>
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


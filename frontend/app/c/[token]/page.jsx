'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '../../../lib/public-api';
import PublicQuotationsPanel from '../../../components/client-public/PublicQuotationsPanel';
import ClientHubProgress from '../../../components/client-public/ClientHubProgress';
import { useIsMobileLayout } from '../../../lib/use-mobile-layout';
import CompanyLogo from '../../../components/CompanyLogo';
import { STUDIO_EMAIL } from '../../../lib/studio-brand';
import '../../../styles/client-public.css';

export default function ClientHubPage() {
  const params = useParams();
  const token = String(params?.token || '').trim();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobileLayout();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    publicApi
      .getHub(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || '無法載入');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const quotations = data?.quotations || [];

  useEffect(() => {
    if (data?.project?.name) {
      document.title = `${data.project.name} · 客戶協作`;
    }
  }, [data]);

  const extras = useMemo(() => {
    if (!data) return null;
    const { links, coming_soon } = data;
    const hasLinks = (links?.length || 0) > 0;
    const hasSoon = !isMobile && (coming_soon?.contract || coming_soon?.invoice);
    if (!hasLinks && !hasSoon) return null;
    return (
      <section className="client-public__extras-card">
        {hasLinks && (
          <>
            <p className="client-public__section-label">審稿與檔案</p>
            {links.map((lnk, i) => (
              <a
                key={i}
                href={lnk.url}
                target="_blank"
                rel="noopener noreferrer"
                className="client-public__link-row"
              >
                {lnk.label}
                <span aria-hidden>→</span>
              </a>
            ))}
          </>
        )}
        {hasSoon && (
          <>
            <p className="client-public__section-label" style={{ marginTop: hasLinks ? '1rem' : 0 }}>
              即將提供
            </p>
            <ul className="client-public__coming">
              {coming_soon.contract && <li>合約確認</li>}
              {coming_soon.invoice && <li>發票與付款狀態</li>}
            </ul>
          </>
        )}
      </section>
    );
  }, [data, isMobile]);

  if (loading) {
    return (
      <div className="client-public client-public__page flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"
          aria-label="載入中"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="client-public client-public__page flex items-center justify-center px-6">
        <p className="text-slate-500 text-sm">{error || '找不到此協作頁'}</p>
      </div>
    );
  }

  const { studio, hub, project, client, progress } = data;

  return (
    <div
      className={`client-public client-public__page ${isMobile ? 'client-public--mobile' : 'client-public--desktop'}`}
    >
      <div className="client-public__inner">
        <header className="client-public__hdr">
          <div className="client-public__brand-block">
            <div className="client-public__brand-mark">
              <CompanyLogo size={28} />
              <h1 className="client-public__brand-name">{studio?.name || 'multi.design studio'}</h1>
            </div>
            {(studio?.contact_email || STUDIO_EMAIL) && (
              <div className="client-public__brand-meta">
                <div>E {studio?.contact_email || STUDIO_EMAIL}</div>
              </div>
            )}
          </div>
          <div>
            <p className="client-public__doc-title">CLIENT</p>
            <p className="client-public__doc-sub">{project.name}</p>
          </div>
        </header>

        {hub?.welcome_message && (
          <p className="client-public__welcome">{hub.welcome_message}</p>
        )}

        <div className="client-public__overview">
          {!isMobile && (
            <section className="client-public__panel">
              <p className="client-public__section-label">專案</p>
              <p className="client-public__project-name">{project.name}</p>
              {client?.name && <p className="client-public__meta-line">{client.name}</p>}
            </section>
          )}

          <section className="client-public__panel client-public__panel--progress">
            {isMobile && client?.name && (
              <p className="client-public__meta-line" style={{ marginBottom: '0.65rem' }}>
                {client.name}
              </p>
            )}
            <ClientHubProgress project={project} progress={progress} compact={isMobile} />
          </section>
        </div>

        {extras}

        {quotations.length > 0 ? (
          <PublicQuotationsPanel
            quotations={quotations}
            projectName={project.name}
            isMobile={isMobile}
          />
        ) : (
          <section className="client-public__quotes-panel client-public__empty-main">
            <p className="client-public__section-label">報價單</p>
            <p className="client-public__meta-line">目前尚無公開報價，請聯繫專案窗口。</p>
          </section>
        )}

        <p className="client-public__footer">如有問題請直接聯繫您的專案窗口</p>
      </div>
    </div>
  );
}

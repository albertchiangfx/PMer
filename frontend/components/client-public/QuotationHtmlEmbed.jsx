'use client';

import { useEffect, useState } from 'react';
import { publicApi } from '../../lib/public-api';

/** 抓取報價 HTML 並 inline 進頁面，隨整頁捲動、無 iframe 裁切 */
export default function QuotationHtmlEmbed({ publicToken, layout = 'full' }) {
  const [markup, setMarkup] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `${publicApi.previewQuotationHtmlUrl(publicToken)}?embed=hub&layout=${encodeURIComponent(layout)}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('無法載入報價');
        return r.text();
      })
      .then((html) => {
        if (cancelled) return;
        const styles = [];
        const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let m;
        while ((m = styleRe.exec(html)) !== null) {
          styles.push(`<style>${m[1]}</style>`);
        }
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const body = bodyMatch ? bodyMatch[1] : html;
        setMarkup(styles.join('\n') + body);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || '載入失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicToken, layout]);

  if (loading) {
    return <p className="client-public__quote-loading">載入報價內容…</p>;
  }
  if (error) {
    return <p className="client-public__quote-loading client-public__quote-loading--err">{error}</p>;
  }

  return (
    <div
      className="client-public__quote-html"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtCurrency } from '../../lib/utils';
import { useDragScroll } from '../../lib/use-drag-scroll';
import { publicApi } from '../../lib/public-api';
import PublicQuotationBlock from './PublicQuotationBlock';

const STATUS_LABEL = {
  sent: '待確認',
  viewed: '已查看',
  accepted: '已接受',
  rejected: '已婉拒',
  expired: '已過期',
};

export default function PublicQuotationsPanel({
  quotations,
  projectName,
  isMobile = false,
}) {
  const useScroller = !isMobile && quotations.length >= 2;
  const scrollerRef = useDragScroll(useScroller);
  const compareBarRef = useRef(null);

  useEffect(() => {
    const main = scrollerRef.current;
    const bar = compareBarRef.current;
    if (!main || !bar || !useScroller) return;
    const sync = () => {
      bar.scrollLeft = main.scrollLeft;
    };
    main.addEventListener('scroll', sync, { passive: true });
    return () => main.removeEventListener('scroll', sync);
  }, [useScroller, scrollerRef]);

  const [statusByToken, setStatusByToken] = useState(() =>
    Object.fromEntries(quotations.map((q) => [q.public_token, q.status]))
  );

  useEffect(() => {
    setStatusByToken(Object.fromEntries(quotations.map((q) => [q.public_token, q.status])));
  }, [quotations]);

  const summaries = useMemo(
    () =>
      quotations.map((q) => ({
        ...q,
        status: statusByToken[q.public_token] ?? q.status,
      })),
    [quotations, statusByToken]
  );

  const applyStatuses = useCallback((list) => {
    if (!list?.length) return;
    setStatusByToken((prev) => {
      const next = { ...prev };
      for (const row of list) {
        if (row.public_token) next[row.public_token] = row.status;
      }
      return next;
    });
  }, []);

  const buildAcceptConfirm = useCallback(
    (token) => {
      const current = statusByToken[token];
      const acceptedOther = quotations.find(
        (q) => q.public_token !== token && statusByToken[q.public_token] === 'accepted'
      );
      if (acceptedOther) {
        const otherLabel =
          acceptedOther.title || acceptedOther.quote_number || '其他方案';
        return `您已選擇「${otherLabel}」。改選後，先前接受的方案將改為婉拒。\n\n確定改選此方案？`;
      }
      if (current === 'rejected') {
        return '此方案先前已標為婉拒。接受後，其他方案將自動婉拒。\n\n確定接受？';
      }
      if (current === 'accepted') {
        return null;
      }
      return '確認接受此報價？接受後，其他方案將自動標為婉拒。';
    },
    [quotations, statusByToken]
  );

  const handleAccept = useCallback(
    async (token) => {
      const msg = buildAcceptConfirm(token);
      if (msg && !confirm(msg)) return;
      const res = await publicApi.acceptQuotation(token);
      applyStatuses(res.quotations);
      return res;
    },
    [applyStatuses, buildAcceptConfirm]
  );

  const handleReject = useCallback(
    async (token) => {
      if (!confirm('確認婉拒此方案？（不影響您已接受的方案）')) return;
      const res = await publicApi.rejectQuotation(token);
      applyStatuses(res.quotations);
      return res;
    },
    [applyStatuses]
  );

  return (
    <section className="client-public__quotes-section">
      <div className="client-public__quotes-section-hdr">
        <div className="client-public__quotes-section-title-row">
          <p className="client-public__section-label" style={{ marginBottom: 0 }}>
            報價單
          </p>
          {summaries.some((q) => q.pdf_path) && (
            <div className="client-public__quote-pdf-toolbar">
              {summaries.map((q, i) =>
                q.pdf_path ? (
                  <a
                    key={q.public_token}
                    href={q.pdf_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="client-public__quote-pdf-btn"
                  >
                    {quotations.length > 1
                      ? `下載 PDF · 方案 ${String.fromCharCode(65 + i)}`
                      : '下載 PDF'}
                  </a>
                ) : null
              )}
            </div>
          )}
        </div>
        {!isMobile && quotations.length >= 2 && (
          <p className="client-public__quotes-hint">
            {projectName
              ? `以下為「${projectName}」的報價方案，可拖曳左右滑動並排比較。`
              : '多份報價可拖曳左右滑動並排比較品項與金額。'}
          </p>
        )}
        {!isMobile && quotations.length === 1 && projectName && (
          <p className="client-public__quotes-hint">「{projectName}」報價方案。</p>
        )}
        {isMobile && (
          <p className="client-public__quotes-hint">摘要如下，點「查看完整報價」可看明細。</p>
        )}
      </div>

      {quotations.length > 1 && (
        <div
          ref={compareBarRef}
          className={`client-public__quote-compare-bar ${
            useScroller ? 'client-public__quote-compare-bar--scroll client-public__quote-compare-bar--synced' : ''
          }`}
        >
          {summaries.map((q, i) => (
            <div key={q.public_token} className="client-public__quote-compare-chip">
              <span className="client-public__quote-compare-chip-scheme">
                方案 {String.fromCharCode(65 + i)}
              </span>
              <span className="client-public__quote-compare-chip-num">{q.quote_number}</span>
              <span className="client-public__quote-compare-chip-total">
                {fmtCurrency(q.total, q.currency)}
              </span>
              <span className="client-public__quote-compare-chip-status">
                {STATUS_LABEL[q.status] || q.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={useScroller ? 'client-public__quote-scroller-wrap' : undefined}>
        <div
          ref={scrollerRef}
          className={
            useScroller
              ? 'client-public__quote-scroller client-public__quote-scroller--draggable'
              : 'client-public__quote-stack'
          }
        >
          {summaries.map((q, i) => (
            <PublicQuotationBlock
              key={q.public_token}
              summary={q}
              status={q.status}
              defaultExpanded={!isMobile}
              columnLayout={useScroller}
              compareLabel={
                quotations.length > 1 ? `方案 ${String.fromCharCode(65 + i)}` : null
              }
              onAccept={() => handleAccept(q.public_token)}
              onReject={() => handleReject(q.public_token)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { publicApi } from '../../lib/public-api';
import { fmtCurrency } from '../../lib/utils';
import QuotationHtmlEmbed from './QuotationHtmlEmbed';

const STATUS_LABEL = {
  sent: '待確認',
  viewed: '已查看',
  accepted: '已接受',
  rejected: '已婉拒',
  expired: '已過期',
};

export default function PublicQuotationBlock({
  summary,
  status: statusProp,
  compareLabel,
  defaultExpanded = true,
  columnLayout = false,
  onAccept,
  onReject,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [actionBusy, setActionBusy] = useState(false);

  const status = statusProp ?? summary.status;
  const embedLayout = columnLayout ? 'column' : 'full';

  useEffect(() => {
    publicApi.markQuotationViewed(summary.public_token).catch(() => {});
  }, [summary.public_token]);

  const statusLabel = STATUS_LABEL[status] || status;
  const canAccept = status !== 'expired';
  const canReject = ['sent', 'viewed'].includes(status);

  const runAccept = async () => {
    setActionBusy(true);
    try {
      await onAccept();
    } catch (e) {
      alert(e?.message || '無法接受');
    } finally {
      setActionBusy(false);
    }
  };

  const runReject = async () => {
    setActionBusy(true);
    try {
      await onReject();
    } catch (e) {
      alert(e?.message || '操作失敗');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <article
      className={`client-public__quote-block ${columnLayout ? 'client-public__quote-block--column' : ''}`}
      id={`quote-${summary.public_token}`}
    >
      {compareLabel && (
        <p className="client-public__quote-compare-label">{compareLabel}</p>
      )}

      {!columnLayout && (
        <div className="client-public__quote-hdr">
          <div>
            <p className="client-public__quote-num">{summary.quote_number}</p>
            {summary.title && <p className="client-public__quote-title">{summary.title}</p>}
          </div>
          <div className="client-public__quote-hdr-right">
            <p className="client-public__quote-total">{fmtCurrency(summary.total, summary.currency)}</p>
            <p className="client-public__quote-status">{statusLabel}</p>
          </div>
        </div>
      )}

      {columnLayout && (
        <div className="client-public__quote-col-meta">
          <span className="client-public__quote-num">{summary.quote_number}</span>
          <span className="client-public__quote-total">{fmtCurrency(summary.total, summary.currency)}</span>
          <span className="client-public__quote-status">{statusLabel}</span>
        </div>
      )}

      <div className="client-public__quote-body">
        {!expanded ? (
          <div className="client-public__quote-collapsed">
            <button
              type="button"
              className="client-public__btn client-public__btn--primary"
              onClick={() => setExpanded(true)}
            >
              查看完整報價
            </button>
          </div>
        ) : (
          <QuotationHtmlEmbed publicToken={summary.public_token} layout={embedLayout} />
        )}
      </div>

      <div className="client-public__quote-actions">
        {expanded && !columnLayout && (
          <button
            type="button"
            className="client-public__btn client-public__btn--ghost"
            onClick={() => setExpanded(false)}
          >
            收合
          </button>
        )}
        {canAccept && status !== 'accepted' && (
          <button
            type="button"
            disabled={actionBusy}
            className="client-public__btn client-public__btn--primary"
            onClick={runAccept}
          >
            {status === 'rejected' ? '改選此方案' : '接受'}
          </button>
        )}
        {canReject && (
          <button
            type="button"
            disabled={actionBusy}
            className="client-public__btn"
            onClick={runReject}
          >
            婉拒
          </button>
        )}
        {status === 'accepted' && (
          <span className="client-public__action-note client-public__action-note--ok">已接受此方案</span>
        )}
        {status === 'rejected' && (
          <span className="client-public__action-note">已婉拒</span>
        )}
        {status === 'accepted' && (
          <p className="client-public__action-hint w-full">
            若要改選，請在另一份方案按「接受」。
          </p>
        )}
      </div>
    </article>
  );
}

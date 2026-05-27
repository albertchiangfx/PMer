/** 客戶公開頁 API（/api/public/*），與內部 api.js 分離 */

function getApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const configured = raw != null ? String(raw).trim() : '';

  if (configured && (configured.startsWith('http://') || configured.startsWith('https://'))) {
    return configured.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const nextDevStylePort =
      port !== '' && port !== '80' && port !== '443' && Number.parseInt(port, 10) > 0;
    if (local && nextDevStylePort) {
      const backendPort = process.env.NEXT_PUBLIC_API_BACKEND_PORT || '3001';
      return `http://127.0.0.1:${backendPort}/api`;
    }
  }

  if (!configured) return 'http://127.0.0.1:3001/api';
  if (configured.startsWith('/')) return configured.replace(/\/$/, '') || '/api';
  return configured.replace(/\/$/, '');
}

async function publicRequest(path, options = {}) {
  const base = getApiBase();
  const url = `${base}/public${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getApiBaseForUrl() {
  return getApiBase();
}

export const publicApi = {
  getApiBase: getApiBaseForUrl,
  getHub: (token) => publicRequest(`/hub/${encodeURIComponent(token)}`),
  getQuotation: (token) => publicRequest(`/quotations/${encodeURIComponent(token)}`),
  previewQuotationHtmlUrl: (token) =>
    `${getApiBase()}/public/quotations/${encodeURIComponent(token)}/preview-html`,
  markQuotationViewed: (token) =>
    publicRequest(`/quotations/${encodeURIComponent(token)}/view`, { method: 'POST' }),
  acceptQuotation: (token) =>
    publicRequest(`/quotations/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
  rejectQuotation: (token) =>
    publicRequest(`/quotations/${encodeURIComponent(token)}/reject`, { method: 'POST' }),
};

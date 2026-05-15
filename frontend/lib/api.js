/**
 * Resolve API origin for fetch().
 * - **next dev**（網址含非 80/443 埠，例如 :3000）：一律打 `http://127.0.0.1:<後端埠>/api`，
 *   避免 `.env` 裡 `http://localhost/api`（其實是 **80 埠**）或 `/api` 經 Next 轉發失敗而出現 404。
 * - **正式／Docker + nginx**（瀏覽器通常是 `http://主機/` 無慣用埠）：使用 NEXT_PUBLIC_API_URL 的 `/api` 或絕對網址。
 */
function getApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const configured = raw != null ? String(raw).trim() : '';

  // 已設定完整網址（LAN、/api-dev 等）時一律採用，避免 next dev 在 localhost:3000 時誤連 127.0.0.1:3001 正式後端
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

async function request(path, options = {}) {
  const base = getApiBase();
  const { timeoutMs = 20000, signal: userSignal, headers: optHeaders, ...rest } = options;
  const signal =
    userSignal ??
    (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...optHeaders },
      signal,
      body: rest.body && typeof rest.body !== 'string' ? JSON.stringify(rest.body) : rest.body,
      cache: 'no-store',
    });
  } catch (e) {
    const timedOut =
      e?.name === 'AbortError' ||
      e?.name === 'TimeoutError' ||
      (typeof DOMException !== 'undefined' &&
        e instanceof DOMException &&
        e.name === 'TimeoutError');
    if (timedOut) {
      throw Object.assign(
        new Error(
          `請求逾時（${timeoutMs / 1000}s）：請確認後端已啟動，埠與 NEXT_PUBLIC_API_BACKEND_PORT 一致`
        ),
        { cause: e }
      );
    }
    if (
      e instanceof TypeError &&
      String(e.message || '')
        .toLowerCase()
        .includes('fetch')
    ) {
      throw Object.assign(new Error('無法連上後端：請確認 API 已啟動且未被防火牆阻擋'), {
        cause: e,
      });
    }
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), {
      status: res.status,
      data: err,
    });
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Projects
  getProjects: (params) => request('/projects' + toQS(params)),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (data) => request('/projects', { method: 'POST', body: data }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: data }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params) => request('/tasks' + toQS(params)),
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: data }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: data }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // Team members
  getTeamMembers: (params) => request('/team-members' + toQS(params)),
  getTeamMember: (id) => request(`/team-members/${id}`),
  createTeamMember: (data) => request('/team-members', { method: 'POST', body: data }),
  updateTeamMember: (id, data) => request(`/team-members/${id}`, { method: 'PUT', body: data }),
  deleteTeamMember: (id) => request(`/team-members/${id}`, { method: 'DELETE' }),
  getMemberSchedule: (id, params) => request(`/team-members/${id}/schedule` + toQS(params)),

  // Schedule allocations (project ↔ member, replaces task-linked time_allocations)
  getAllocations: (params) => request('/allocations' + toQS(params)),
  getProjectAllocations: (projectId, params) =>
    request(`/projects/${projectId}/allocations` + toQS(params)),
  getMemberAllocations: (memberId, params) =>
    request(`/members/${memberId}/allocations` + toQS(params)),
  createAllocation: (data) => request('/allocations', { method: 'POST', body: data }),
  updateAllocation: (id, data) => request(`/allocations/${id}`, { method: 'PUT', body: data }),
  deleteAllocation: (id) => request(`/allocations/${id}`, { method: 'DELETE' }),
  checkConflicts: (data) => request('/allocations/check-conflicts', { method: 'POST', body: data }),
  checkConflictsGET: (params) => request('/allocations/check-conflicts' + toQS(params)),

  getMilestoneSummaryByProjects: (projectIds) =>
    request(
      '/project-milestones/by-projects' +
        (projectIds?.length ? `?ids=${projectIds.map(encodeURIComponent).join(',')}` : '')
    ),
  getProjectMilestonesByProjects: (projectIds) =>
    request(
      '/project-milestones/list-by-projects' +
        (projectIds?.length ? `?ids=${projectIds.map(encodeURIComponent).join(',')}` : '')
    ),
  getProjectMilestones: (projectId) =>
    request(`/project-milestones?project_id=${encodeURIComponent(projectId)}`),
  createProjectMilestone: (data) => request('/project-milestones', { method: 'POST', body: data }),
  /** PATCH：舊版後端映像若未含 PUT /:id 會 404；PATCH 一直存在。 */
  updateProjectMilestone: (id, data) =>
    request(`/project-milestones/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
  deleteProjectMilestone: (id) =>
    request(`/project-milestones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderProjectMilestones: (ordered_ids) =>
    request('/project-milestones/reorder', { method: 'POST', body: { ordered_ids } }),
  bootstrapProjectMilestones: (body) =>
    request('/project-milestones/bootstrap', { method: 'POST', body }),
  addFinalEditRound: (project_id) =>
    request('/project-milestones/add-final-edit-round', { method: 'POST', body: { project_id } }),

  getPersonalTasks: (params) => request('/personal-tasks' + toQS(params)),
  createPersonalTask: (data) => request('/personal-tasks', { method: 'POST', body: data }),
  updatePersonalTask: (id, data) =>
    request(`/personal-tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
  deletePersonalTask: (id) =>
    request(`/personal-tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** @deprecated Legacy task-based allocations (avoid for new UI) */
  getTimeAllocations: (params) => request('/time-allocations' + toQS(params)),
  createTimeAllocation: (data) => request('/time-allocations', { method: 'POST', body: data }),
  updateTimeAllocation: (id, data) =>
    request(`/time-allocations/${id}`, { method: 'PUT', body: data }),
  deleteTimeAllocation: (id) => request(`/time-allocations/${id}`, { method: 'DELETE' }),

  // Contracts
  getContracts: (params) => request('/contracts' + toQS(params)),
  getContract: (id) => request(`/contracts/${id}`),
  createContract: (data) => request('/contracts', { method: 'POST', body: data }),
  updateContract: (id, data) => request(`/contracts/${id}`, { method: 'PUT', body: data }),
  deleteContract: (id) => request(`/contracts/${id}`, { method: 'DELETE' }),

  // Invoices
  getInvoices: (params) => request('/invoices' + toQS(params)),
  getInvoice: (id) => request(`/invoices/${id}`),
  createInvoice: (data) => request('/invoices', { method: 'POST', body: data }),
  generateInvoicePreview: (data) => request('/invoices/generate', { method: 'POST', body: data }),
  updateInvoice: (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: data }),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
  downloadInvoicePDF: (id) => `${getApiBase()}/invoices/${id}/pdf`,

  // Clients
  getClients: () => request('/clients'),
  createClient: (data) => request('/clients', { method: 'POST', body: data }),
  updateClient: (id, data) =>
    request(`/clients/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  deleteClient: (id) => request(`/clients/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

function toQS(params) {
  if (!params) return '';
  const q = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? '?' + q : '';
}

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err });
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
  checkConflictsGET: (params) =>
    request('/allocations/check-conflicts' + toQS(params)),

  getMilestoneSummaryByProjects: (projectIds) =>
    request(
      '/project-milestones/by-projects' +
        (projectIds?.length ? `?ids=${projectIds.map(encodeURIComponent).join(',')}` : '')
    ),
  getProjectMilestones: (projectId) =>
    request(`/project-milestones?project_id=${encodeURIComponent(projectId)}`),
  createProjectMilestone: (data) => request('/project-milestones', { method: 'POST', body: data }),
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
  updateTimeAllocation: (id, data) => request(`/time-allocations/${id}`, { method: 'PUT', body: data }),
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
  downloadInvoicePDF: (id) => `${BASE}/invoices/${id}/pdf`,

  // Clients
  getClients: () => request('/projects/meta/clients'),
};

function toQS(params) {
  if (!params) return '';
  const q = Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return q ? '?' + q : '';
}

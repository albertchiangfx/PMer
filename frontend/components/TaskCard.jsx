'use client';
import { fmt, statusStyle, initials } from '../lib/utils';

export default function TaskCard({ task, onEdit, onDelete }) {
  const s = statusStyle(task.status);
  const priorityColors = {
    high: 'text-red-500',
    medium: 'text-yellow-500',
    low: 'text-green-500',
  };

  return (
    <div className="bg-white rounded-apple shadow-apple-sm border border-gray-100 p-4 hover:shadow-apple transition-all duration-200 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold uppercase ${priorityColors[task.priority] || 'text-gray-400'}`}
            >
              {task.priority}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-[10px] text-gray-400 uppercase font-medium">
              {task.task_type}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{task.name}</h3>
          {task.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${s.bg} ${s.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {task.status}
        </span>
      </div>

      {/* Dates */}
      {(task.start_date || task.end_date) && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-400">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{fmt(task.start_date)}</span>
          {task.end_date && (
            <>
              <span>→</span>
              <span>{fmt(task.end_date)}</span>
            </>
          )}
        </div>
      )}

      {/* Assignees */}
      {task.allocations?.length > 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          {task.allocations.slice(0, 4).map((a) => (
            <div
              key={a.id}
              title={a.member_name}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white"
              style={{ backgroundColor: a.avatar_color || '#6366f1' }}
            >
              {initials(a.member_name || '')}
            </div>
          ))}
          {task.allocations.length > 4 && (
            <span className="text-[10px] text-gray-400">+{task.allocations.length - 4}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit?.(task)}
          className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
        >
          編輯
        </button>
        <span className="text-gray-200">·</span>
        <button
          onClick={() => onDelete?.(task)}
          className="text-[11px] text-red-500 hover:text-red-600 font-medium"
        >
          刪除
        </button>
      </div>
    </div>
  );
}

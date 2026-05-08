'use client';
import BackToDashboard from '../../components/BackToDashboard';
import SchedulePanel from '../../components/SchedulePanel';

export default function SchedulePage() {
  return (
    <div className="p-8 animate-fade-in">
      <BackToDashboard className="mb-4" />
      <SchedulePanel />
    </div>
  );
}

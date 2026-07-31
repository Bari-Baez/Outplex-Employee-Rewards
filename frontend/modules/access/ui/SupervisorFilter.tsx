import { Users, FilterX } from 'lucide-react';
import { ModernSelect } from '@frontend/shared/ui/Select';

export interface SupervisorFilterProps {
  supervisors: [string, string][]; // [id, name]
  currentSupervisorFilter: string | 'all' | 'my-team';
  onFilterChange: (value: string | 'all' | 'my-team') => void;
  currentUserRole: string;
  currentUserId: string;
}

export function SupervisorFilter({
  supervisors,
  currentSupervisorFilter,
  onFilterChange,
  currentUserRole,
  currentUserId: _currentUserId,
}: SupervisorFilterProps) {
  const isB1 = currentUserRole === 'moderator_b1';
  const showMyTeam = isB1;
  const effectiveFilter =
    !showMyTeam && currentSupervisorFilter === 'my-team' ? 'all' : currentSupervisorFilter;

  return (
    <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {showMyTeam && (
        <button
          onClick={() => onFilterChange(effectiveFilter === 'my-team' ? 'all' : 'my-team')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.75rem',
            backgroundColor: effectiveFilter === 'my-team' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
            color: effectiveFilter === 'my-team' ? '#818cf8' : '#a1a1aa',
            border: `1px solid ${effectiveFilter === 'my-team' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Users size={14} />
          My Team
        </button>
      )}

      <div style={{ minWidth: '180px' }}>
        <ModernSelect
          value={effectiveFilter}
          onValueChange={onFilterChange}
          options={[
            { label: 'All Supervisors', value: 'all' },
            ...(showMyTeam ? [{ label: 'My Team', value: 'my-team' }] : []),
            ...supervisors.map(([id, name]) => ({
              label: name,
              value: id
            }))
          ]}
        />
      </div>
    </div>
  );
}

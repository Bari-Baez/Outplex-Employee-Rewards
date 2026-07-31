/**
 * Presentation/demo contract shared by browser and server. The seeding and
 * reset routines that produce these shapes live in
 * `@backend/modules/simulation/application/presentation-service`.
 */
import type { UserRole } from '@shared/contracts/database';

export const DEMO_PASSWORD = 'password123';

export const PRESENTATION_DEMO_USERS = [
  {
    email: 'it@outplex.test',
    role: 'admin' as const,
    name: 'Ava Bennett',
    employeeId: 'ADM001',
    department: 'IT',
    defaultPoints: 12000,
  },
  {
    email: 'a1@outplex.test',
    role: 'moderator_a1' as const,
    name: 'Maya Ortiz',
    employeeId: 'MOD001',
    department: 'Operations',
    defaultPoints: 5400,
  },
  {
    email: 'b1@outplex.test',
    role: 'moderator_b1' as const,
    name: 'Jordan Lee',
    employeeId: 'MOD002',
    department: 'Operations',
    defaultPoints: 4700,
  },
  {
    email: 'employee@outplex.test',
    role: 'employee' as const,
    name: 'Bari Baez',
    employeeId: 'EMP001',
    department: 'NYT VOICE',
    defaultPoints: 9810,
  },
] as const;

export interface PresentationDirectoryUser {
  id: string;
  name: string;
  email: string;
  employee_id: string | null;
  role: UserRole;
  points: number;
  department: string | null;
  isDemo: boolean;
}

export interface PresentationStatus {
  users: PresentationDirectoryUser[];
  demoUsers: PresentationDirectoryUser[];
  counts: {
    users: number;
    storeItems: number;
    storeOrders: number;
    otSlots: number;
    claimedOtSlots: number;
    otBatches: number;
    raffles: number;
    notifications: number;
    pointsLedger: number;
    supportTickets: number;
    lowStockItems: number;
  };
  defaultPassword: string;
}

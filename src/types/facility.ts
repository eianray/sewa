export type FacilityType = 'wwtp' | 'lift_station' | 'cso' | 'sso' | 'outfall' | 'other';

export interface Facility {
  id: string;
  project_id: string;
  user_id: string;
  facility_id: string;
  facility_type: FacilityType;
  name: string;
  lat: number;
  lng: number;
  capacity_cfs: number | null;
  capacity_mgd: number | null;
  allocated_cfs: number;
  allocated_mgd: number;
  remaining_cfs: number;
  remaining_mgd: number;
  properties: Record<string, unknown>;
  created_at: string;
}

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  wwtp: 'WWTP',
  lift_station: 'Lift Station',
  cso: 'CSO',
  sso: 'SSO',
  outfall: 'Outfall',
  other: 'Other',
};

export const FACILITY_COLORS: Record<FacilityType, string> = {
  wwtp: '#10B981',
  lift_station: '#3B82F6',
  cso: '#F59E0B',
  sso: '#EF4444',
  outfall: '#8B5CF6',
  other: '#6B7280',
};

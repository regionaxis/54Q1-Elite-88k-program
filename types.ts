
export interface WeeklyData {
  meetings: number;
  effectiveMeetings: number;
  hasNewClient: boolean;
}

export interface Student {
  id: string;
  name: string;
  manager: string;
  totalSC: number;
  weeklyData: WeeklyData[];
}

export interface ProcessedStudent extends Student {
  cumulativeEffective: number;
  isAchiever: boolean;
}

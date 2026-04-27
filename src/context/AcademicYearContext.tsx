import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AcademicYearStatus } from '../types/yearClosing.types';

export interface AcademicYear {
  id: string;
  name: string;          // e.g., '2024-2025'
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: AcademicYearStatus;  // 'ACTIVE' | 'LOCKED'
  board: string;
  closedDate?: string;
}

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  activeYear: AcademicYear | null;
  addAcademicYear: (year: Omit<AcademicYear, 'id' | 'isActive' | 'status'>) => string;
  setActiveYear: (id: string) => void;
  lockYear: (id: string) => void;
  removeAcademicYear: (id: string) => void;
  isYearLocked: (id: string) => boolean;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

const DEFAULT_YEARS: AcademicYear[] = [
  {
    id: 'ay_1',
    name: '2023-2024',
    startDate: '2023-04-01',
    endDate: '2024-03-31',
    isActive: false,
    status: 'LOCKED',
    board: 'CBSE',
    closedDate: '2024-03-31',
  },
  {
    id: 'ay_2',
    name: '2024-2025',
    startDate: '2024-04-01',
    endDate: '2025-03-31',
    isActive: true,
    status: 'ACTIVE',
    board: 'CBSE',
  },
];

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(() => {
    const saved = localStorage.getItem('school_academic_years');
    if (saved) {
      try {
        const parsed: AcademicYear[] = JSON.parse(saved);
        // Migrate old data that may not have status field
        return parsed.map(y => ({
          board: 'CBSE',
          ...y,
          status: y.status ?? (y.isActive ? 'ACTIVE' : 'LOCKED'),
        }));
      } catch {
        return DEFAULT_YEARS;
      }
    }
    return DEFAULT_YEARS;
  });

  useEffect(() => {
    localStorage.setItem('school_academic_years', JSON.stringify(academicYears));
  }, [academicYears]);

  const activeYear = academicYears.find(y => y.isActive) ?? null;

  const addAcademicYear = (newYear: Omit<AcademicYear, 'id' | 'isActive' | 'status'>): string => {
    const id = `ay_${Date.now()}`;
    setAcademicYears(prev => [
      ...prev.map(y => ({ ...y, isActive: false })),   // deactivate all
      {
        ...newYear,
        id,
        isActive: true,
        status: 'ACTIVE' as AcademicYearStatus,
      },
    ]);
    return id;
  };

  const setActiveYear = (id: string) => {
    setAcademicYears(prev =>
      prev.map(y => ({ ...y, isActive: y.id === id }))
    );
  };

  const lockYear = (id: string) => {
    setAcademicYears(prev =>
      prev.map(y =>
        y.id === id
          ? { ...y, status: 'LOCKED' as AcademicYearStatus, isActive: false, closedDate: new Date().toISOString().split('T')[0] }
          : y
      )
    );
  };

  const removeAcademicYear = (id: string) => {
    setAcademicYears(prev => prev.filter(y => y.id !== id));
  };

  const isYearLocked = (id: string): boolean => {
    const year = academicYears.find(y => y.id === id);
    return year?.status === 'LOCKED';
  };

  return (
    <AcademicYearContext.Provider
      value={{ academicYears, activeYear, addAcademicYear, setActiveYear, lockYear, removeAcademicYear, isYearLocked }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
};

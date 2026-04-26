import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AcademicYear {
  id: string;
  name: string; // e.g., '2024-2025'
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  activeYear: AcademicYear | null;
  addAcademicYear: (year: Omit<AcademicYear, 'id' | 'isActive'>) => void;
  setActiveYear: (id: string) => void;
  removeAcademicYear: (id: string) => void;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(() => {
    const saved = localStorage.getItem('school_academic_years');
    if (saved) {
      return JSON.parse(saved);
    }
    return [
      {
        id: 'ay_1',
        name: '2023-2024',
        startDate: '2023-04-01',
        endDate: '2024-03-31',
        isActive: false,
      },
      {
        id: 'ay_2',
        name: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('school_academic_years', JSON.stringify(academicYears));
  }, [academicYears]);

  const activeYear = academicYears.find(y => y.isActive) || null;

  const addAcademicYear = (newYear: Omit<AcademicYear, 'id' | 'isActive'>) => {
    setAcademicYears(prev => [
      ...prev,
      {
        ...newYear,
        id: `ay_${Date.now()}`,
        isActive: false,
      }
    ]);
  };

  const setActiveYear = (id: string) => {
    setAcademicYears(prev => prev.map(y => ({
      ...y,
      isActive: y.id === id,
    })));
  };

  const removeAcademicYear = (id: string) => {
    setAcademicYears(prev => prev.filter(y => y.id !== id));
  };

  return (
    <AcademicYearContext.Provider value={{ academicYears, activeYear, addAcademicYear, setActiveYear, removeAcademicYear }}>
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

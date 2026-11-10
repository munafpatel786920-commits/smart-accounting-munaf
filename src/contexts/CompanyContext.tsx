import React, { createContext, useContext, useState, useEffect } from 'react';
import { dataService, authService, isElectronEnvironment } from '../services/dataService';
import { Company } from '../types';

interface CompanyContextType {
  activeCompany: Company | null;
  companies: Company[];
  setActiveCompany: (company: Company | null) => void;
  refreshCompanies: () => void;
  loading: boolean;
  isOfflineMode: boolean;
  environment: 'web' | 'electron';
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const isOfflineMode = isElectronEnvironment();
  const environment = dataService.getEnvironment();

  useEffect(() => {
    let unsubscribeCompanies: (() => void) | null = null;

    const unsubscribeAuth = authService.onAuthStateChanged((user) => {
      console.log("CompanyContext: Auth state changed:", user?.uid, "Environment:", environment);
      if (unsubscribeCompanies) {
        unsubscribeCompanies();
        unsubscribeCompanies = null;
      }

      if (user) {
        console.log("CompanyContext: Fetching all companies for:", user.uid);
        // Do not restrict by createdBy so user can see all their existing companies (abc, ica, fatima, etc.)
        const conditions = undefined;

        unsubscribeCompanies = dataService.onSnapshotCollection<Company>(
          'companies',
          conditions,
          (companiesData) => {
            console.log("CompanyContext: Companies fetched:", companiesData.length);
            setCompanies(companiesData);

            // Try to restore active company from localStorage
            const savedCompanyId = localStorage.getItem('activeCompanyId');
            if (savedCompanyId) {
              const savedCompany = companiesData.find((c) => c.id === savedCompanyId);
              if (savedCompany && !savedCompany.useSecurity) {
                setActiveCompanyState(savedCompany);
                setLoading(false);
                return;
              }
            }

            if (companiesData.length > 0) {
              // Prefer company "abc" (where transactions are stored) or first non-security company
              const preferredCompany = 
                companiesData.find((c) => (c.name || '').toLowerCase() === 'abc' && !c.useSecurity) ||
                companiesData.find((c) => (c.name || '').toLowerCase() === 'smart enterprise' && !c.useSecurity) ||
                companiesData.find((c) => !c.useSecurity) ||
                companiesData[0];

              if (preferredCompany) {
                setActiveCompanyState(preferredCompany);
                localStorage.setItem('activeCompanyId', preferredCompany.id!);
              } else {
                setActiveCompanyState(null);
                localStorage.removeItem('activeCompanyId');
              }
            } else {
              setActiveCompanyState(null);
              localStorage.removeItem('activeCompanyId');
            }
            setLoading(false);
          },
          (error) => {
            console.error('Error fetching companies:', error);
            setLoading(false);
          }
        );
      } else {
        console.log("CompanyContext: No user, clearing companies");
        setCompanies([]);
        setActiveCompanyState(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeCompanies) unsubscribeCompanies();
    };
  }, [environment]);

  const setActiveCompany = (company: Company | null) => {
    setActiveCompanyState(company);
    if (company?.id) {
      localStorage.setItem('activeCompanyId', company.id);
    } else {
      localStorage.removeItem('activeCompanyId');
    }
  };

  const refreshCompanies = () => {
    const user = authService.getUser();
    if (user) {
      const conditions = (user.email === 'patelmunaf90@gmail.com' || user.isLocalUser)
        ? undefined
        : [{ field: 'createdBy', operator: '==' as const, value: user.uid }];
      dataService.getDocuments<Company>('companies', conditions).then((list) => {
        setCompanies(list);
      });
    }
  };

  return (
    <CompanyContext.Provider
      value={{
        activeCompany,
        companies,
        setActiveCompany,
        refreshCompanies,
        loading,
        isOfflineMode,
        environment
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}

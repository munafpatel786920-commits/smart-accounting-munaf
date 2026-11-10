import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { 
  collection,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dataService } from '../services/dataService';
import { useCompany } from '../contexts/CompanyContext';
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  FileText, 
  UserPlus, 
  Clipboard, 
  CheckCircle2, 
  DollarSign, 
  UsersRound, 
  Clock, 
  Printer, 
  Building, 
  Activity, 
  Grid2X2,
  X,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id?: string;
  name: string;
  employeeId: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  basicPay: number;
  bankName: string;
  bankAccount: string;
  pfNumber: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

interface AttendanceRecord {
  employeeId: string;
  presentDays: number;
  overtimeHours: number;
  remarks: string;
}

interface PaySlipRecord {
  employeeId: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  basicPay: number;
  presentDays: number;
  overtimeHours: number;
  earnings: {
    basic: number;
    hra: number;
    overtime: number;
    da: number;
    total: number;
  };
  deductions: {
    pf: number;
    pt: number;
    total: number;
  };
  netPay: number;
  customEarnings?: { [key: string]: number };
  customDeductions?: { [key: string]: number };
}

interface PayHead {
  id?: string;
  name: string;
  type: 'earning' | 'deduction';
  calculationType: 'flat' | 'percentage';
  defaultValue: number;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

interface PayRun {
  id?: string;
  month: string; // e.g. "2026-06"
  notes: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
  records: PaySlipRecord[];
}

export default function Payroll() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'generate'>('employees');

  // Loaders & database lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payruns, setPayruns] = useState<PayRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Employee CRUD Form states
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empDateOfJoining, setEmpDateOfJoining] = useState('');
  const [empBasicPay, setEmpBasicPay] = useState(25000);
  const [empBankName, setEmpBankName] = useState('');
  const [empBankAccount, setEmpBankAccount] = useState('');
  const [empPfNumber, setEmpPfNumber] = useState('');

  // Attendance Sheet Entry states
  const [attendanceMonth, setAttendanceMonth] = useState('2026-06');
  const [attendanceSheet, setAttendanceSheet] = useState<{ [empId: string]: AttendanceRecord }>({});

  // Payroll Generation states
  const [selectedPayMonth, setSelectedPayMonth] = useState('2026-06');
  const [notes, setNotes] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<PaySlipRecord | null>(null);
  const [payslipRunMonth, setPayslipRunMonth] = useState('');

  // Default Invariant Coefficient States (now fully customizable!)
  const [hraRate, setHraRate] = useState(40); // 40% HRA
  const [daRate, setDaRate] = useState(10);   // 10% DA
  const [pfRate, setPfRate] = useState(12);   // 12% PF
  const [ptFlat, setPtFlat] = useState(200);  // flat INR 200 Professional Tax
  const [otMultiplier, setOtMultiplier] = useState(1.5); // 1.5x Overtime premium
  const [draftRecords, setDraftRecords] = useState<PaySlipRecord[]>([]);

  // Customizable Pay Heads Master States
  const [payHeads, setPayHeads] = useState<PayHead[]>([]);
  const customEarningHeads = payHeads.filter(ph => ph.type === 'earning');
  const customDeductionHeads = payHeads.filter(ph => ph.type === 'deduction');
  const [showPayHeadsModal, setShowPayHeadsModal] = useState(false);
  const [editingPayHead, setEditingPayHead] = useState<PayHead | null>(null);
  const [payHeadName, setPayHeadName] = useState('');
  const [payHeadType, setPayHeadType] = useState<'earning' | 'deduction'>('earning');
  const [payHeadCalcType, setPayHeadCalcType] = useState<'flat' | 'percentage'>('flat');
  const [payHeadDefaultValue, setPayHeadDefaultValue] = useState<number>(0);

  // Dynamic Iframe-Safe Non-Modal Delete Confirmation States
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [empDeleteConfirmId, setEmpDeleteConfirmId] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Sync details from DB
  useEffect(() => {
    if (!activeCompany?.id) return;

    setLoading(true);

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubEmp = dataService.onSnapshotCollection<Employee>(
      'employees',
      conditions,
      (list) => {
        setEmployees(list);

        // Initialize default attendance sheet entries for any new employees
        setAttendanceSheet(prev => {
          const next = { ...prev };
          list.forEach(emp => {
            if (!next[emp.id || '']) {
              next[emp.id || ''] = {
                employeeId: emp.id || '',
                presentDays: 30,
                overtimeHours: 0,
                remarks: ''
              };
            }
          });
          return next;
        });
        setLoading(false);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) {
          setLoading(false);
          return;
        }
        console.error("Error reading employees database:", error);
        toast.error("Failed to load employees");
        setLoading(false);
      }
    );

    const unsubRuns = dataService.onSnapshotCollection<PayRun>(
      'payruns',
      conditions,
      (list) => {
        setPayruns(list);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error("Error reading payruns:", error);
      }
    );

    const unsubPayHeads = dataService.onSnapshotCollection<PayHead>(
      'payheads',
      conditions,
      (list) => {
        setPayHeads(list);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error("Error reading payheads database:", error);
      }
    );

    return () => {
      unsubEmp();
      unsubRuns();
      unsubPayHeads();
    };
  }, [activeCompany?.id]);

  // Form Reset
  const resetFormState = () => {
    setEditingEmployee(null);
    setEmpName('');
    setEmpCode('');
    setEmpDesignation('');
    setEmpDepartment('');
    setEmpDateOfJoining(new Date().toISOString().split('T')[0]);
    setEmpBasicPay(25000);
    setEmpBankName('');
    setEmpBankAccount('');
    setEmpPfNumber('');
    setShowEmployeeForm(false);
  };

  // Add/Edit Employee handle
  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany?.id) return;

    if (!empName.trim() || !empCode.trim()) {
      toast.error('Employee Name and Employee ID are required');
      return;
    }

    // Duplicate check on Employee ID
    const duplicate = employees.some(
      emp => emp.employeeId.trim().toLowerCase() === empCode.trim().toLowerCase() && emp.id !== editingEmployee?.id
    );

    if (duplicate) {
      toast.error(`Employee ID '${empCode}' is already allocated to another employee!`);
      return;
    }

    const payload = {
      name: empName.trim(),
      employeeId: empCode.trim().toUpperCase(),
      designation: empDesignation.trim(),
      department: empDepartment.trim(),
      dateOfJoining: empDateOfJoining,
      basicPay: Number(empBasicPay),
      bankName: empBankName.trim(),
      bankAccount: empBankAccount.trim(),
      pfNumber: empPfNumber.trim(),
      companyId: activeCompany.id,
      createdBy: uid,
      createdAt: editingEmployee ? editingEmployee.createdAt : new Date().toISOString()
    };

    try {
      if (editingEmployee?.id) {
        await updateDoc(doc(db, 'employees', editingEmployee.id), payload);
        toast.success(`Employee '${empName}' updated successfully!`);
      } else {
        await addDoc(collection(db, 'employees'), payload);
        toast.success(`Employee '${empName}' created successfully!`);
      }
      resetFormState();
    } catch (error: any) {
      toast.error(`Database error: ${error.message}`);
    }
  };

  // Open Edit Employee modal
  const startEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpName(emp.name);
    setEmpCode(emp.employeeId);
    setEmpDesignation(emp.designation);
    setEmpDepartment(emp.department);
    setEmpDateOfJoining(emp.dateOfJoining || '');
    setEmpBasicPay(emp.basicPay);
    setEmpBankName(emp.bankName || '');
    setEmpBankAccount(emp.bankAccount || '');
    setEmpPfNumber(emp.pfNumber || '');
    setShowEmployeeForm(true);
  };

  // Remove Employee
  const deleteEmployee = async (id: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'employees', id));
      toast.success(`Employee '${name}' deleted successfully!`);
    } catch (error: any) {
      toast.error(`Failed to delete employee: ${error.message}`);
    }
  };

  // Attendance grid updates
  const updateAttendanceCell = (empId: string, field: 'presentDays' | 'overtimeHours' | 'remarks', val: any) => {
    setAttendanceSheet(prev => {
      const record = prev[empId] || {
        employeeId: empId,
        presentDays: 30,
        overtimeHours: 0,
        remarks: ''
      };
      
      let ParsedValue = val;
      if (field === 'presentDays') {
        ParsedValue = Math.min(31, Math.max(0, Number(val) || 0));
      } else if (field === 'overtimeHours') {
        ParsedValue = Math.max(0, Number(val) || 0);
      }

      return {
        ...prev,
        [empId]: {
          ...record,
          [field]: ParsedValue
        }
      };
    });
  };

  // Initialize draft sheet starting values using defaults/coefficients with custom pay heads
  const initDraftRecordsCustom = (
    hra = hraRate,
    da = daRate,
    pf = pfRate,
    pt = ptFlat,
    ot = otMultiplier
  ) => {
    const list = employees.map(emp => {
      const att = attendanceSheet[emp.id || ''] || {
        employeeId: emp.id || '',
        presentDays: 30,
        overtimeHours: 0,
        remarks: ''
      };

      const daysInCycle = 30;
      const basicEarned = Math.round((emp.basicPay / daysInCycle) * att.presentDays);
      const hraVal = Math.round(basicEarned * (hra / 100));
      const daVal = Math.round(basicEarned * (da / 100));

      const hourlyRate = (emp.basicPay / 240);
      const overtimePay = Math.round(hourlyRate * att.overtimeHours * ot);

      // Compute dynamic custom pay heads
      const customEarnings: { [key: string]: number } = {};
      const customDeductions: { [key: string]: number } = {};

      payHeads.forEach(ph => {
        let val = 0;
        if (ph.calculationType === 'percentage') {
          val = Math.round(basicEarned * (ph.defaultValue / 100));
        } else {
          val = ph.defaultValue;
        }

        if (ph.type === 'earning') {
          customEarnings[ph.name] = val;
        } else {
          customDeductions[ph.name] = val;
        }
      });

      const totalCustomEarnings = Object.values(customEarnings).reduce((a, b) => a + b, 0);
      const totalCustomDeductions = Object.values(customDeductions).reduce((a, b) => a + b, 0);

      const totalEarnings = basicEarned + hraVal + daVal + overtimePay + totalCustomEarnings;

      const pfVal = Math.round(basicEarned * (pf / 100));
      const ptVal = att.presentDays > 0 ? pt : 0;

      const totalDeductions = pfVal + ptVal + totalCustomDeductions;
      const netPay = totalEarnings - totalDeductions;

      return {
        employeeId: emp.id || '',
        employeeCode: emp.employeeId,
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        basicPay: emp.basicPay,
        presentDays: att.presentDays,
        overtimeHours: att.overtimeHours,
        earnings: {
          basic: basicEarned,
          hra: hraVal,
          da: daVal,
          overtime: overtimePay,
          total: totalEarnings
        },
        deductions: {
          pf: pfVal,
          pt: ptVal,
          total: totalDeductions
        },
        netPay,
        customEarnings,
        customDeductions
      };
    });
    setDraftRecords(list);
  };

  const initDraftRecords = () => {
    initDraftRecordsCustom(hraRate, daRate, pfRate, ptFlat, otMultiplier);
  };

  // Helper to reset both custom rate controls and the spreadsheet cells to defaults
  const handleResetToDefaultFormulas = () => {
    setHraRate(40);
    setDaRate(10);
    setPfRate(12);
    setPtFlat(200);
    setOtMultiplier(1.5);
    initDraftRecordsCustom(40, 10, 12, 200, 1.5);
    toast.success("Successfully reset formula coefficients to system defaults and cleared manual overrides.");
  };

  // Initialize spreadsheet rows starting point
  useEffect(() => {
    if (activeTab === 'generate') {
      initDraftRecords();
    }
  }, [employees, attendanceSheet, selectedPayMonth, hraRate, daRate, pfRate, ptFlat, otMultiplier, activeTab, payHeads]);

  // Handle cell manual override edits for standard fields
  const updateDraftCell = (
    empId: string,
    section: 'earnings' | 'deductions',
    field: 'basic' | 'hra' | 'da' | 'overtime' | 'pf' | 'pt',
    value: string
  ) => {
    const parsed = Math.max(0, Math.round(Number(value) || 0));
    setDraftRecords(prev => prev.map(rec => {
      if (rec.employeeId !== empId) return rec;

      const updated = { ...rec };
      if (section === 'earnings') {
        updated.earnings = {
          ...updated.earnings,
          [field]: parsed
        };
      } else {
        updated.deductions = {
          ...updated.deductions,
          [field]: parsed
        };
      }

      // Re-sum row totals and net including custom pay heads
      const totalCustomEarnings = Object.values(updated.customEarnings || {}).reduce((a, b) => a + b, 0);
      const totalCustomDeductions = Object.values(updated.customDeductions || {}).reduce((a, b) => a + b, 0);

      updated.earnings.total = updated.earnings.basic + updated.earnings.hra + updated.earnings.da + updated.earnings.overtime + totalCustomEarnings;
      updated.deductions.total = updated.deductions.pf + updated.deductions.pt + totalCustomDeductions;
      updated.netPay = updated.earnings.total - updated.deductions.total;

      return updated;
    }));
  };

  // Handle cell manual override edits for dynamic Custom Heades
  const updateDraftCustomCell = (
    empId: string,
    section: 'earnings' | 'deductions',
    headName: string,
    value: string
  ) => {
    const parsed = Math.max(0, Math.round(Number(value) || 0));
    setDraftRecords(prev => prev.map(rec => {
      if (rec.employeeId !== empId) return rec;

      const updated = { ...rec };
      if (section === 'earnings') {
        const nextCustom = { ...updated.customEarnings };
        nextCustom[headName] = parsed;
        updated.customEarnings = nextCustom;
      } else {
        const nextCustom = { ...updated.customDeductions };
        nextCustom[headName] = parsed;
        updated.customDeductions = nextCustom;
      }

      // Re-sum row totals and net
      const totalCustomEarnings = Object.values(updated.customEarnings || {}).reduce((a, b) => a + b, 0);
      const totalCustomDeductions = Object.values(updated.customDeductions || {}).reduce((a, b) => a + b, 0);

      updated.earnings.total = updated.earnings.basic + updated.earnings.hra + updated.earnings.da + updated.earnings.overtime + totalCustomEarnings;
      updated.deductions.total = updated.deductions.pf + updated.deductions.pt + totalCustomDeductions;
      updated.netPay = updated.earnings.total - updated.deductions.total;

      return updated;
    }));
  };

  // Submit / Save custom Pay Head
  const handlePayHeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany?.id) return;

    if (!payHeadName.trim()) {
      toast.error('Pay Head Name is required');
      return;
    }

    const nameNormalized = payHeadName.trim();
    // Check duplicate payhead name
    const duplicate = payHeads.some(
      ph => ph.name.trim().toLowerCase() === nameNormalized.toLowerCase() && ph.id !== editingPayHead?.id
    );
    if (duplicate) {
      toast.error(`Pay Head with name '${nameNormalized}' already exists!`);
      return;
    }

    // Reserved names warning
    const reserved = ['basic', 'hra', 'da', 'overtime', 'pf', 'pt', 'total', 'net pay'];
    if (reserved.includes(nameNormalized.toLowerCase())) {
      toast.error(`'${nameNormalized}' is a system reserved name. Please use a different name.`);
      return;
    }

    const payload = {
      name: nameNormalized,
      type: payHeadType,
      calculationType: payHeadCalcType,
      defaultValue: Number(payHeadDefaultValue) || 0,
      companyId: activeCompany.id,
      createdBy: uid,
      createdAt: editingPayHead ? editingPayHead.createdAt : new Date().toISOString()
    };

    try {
      if (editingPayHead?.id) {
        await updateDoc(doc(db, 'payheads', editingPayHead.id), payload);
        toast.success(`Pay Head '${nameNormalized}' updated successfully!`);
      } else {
        await addDoc(collection(db, 'payheads'), payload);
        toast.success(`Pay Head '${nameNormalized}' added successfully!`);
      }
      setEditingPayHead(null);
      setPayHeadName('');
      setPayHeadDefaultValue(0);
    } catch (err: any) {
      toast.error(`Failed to save Pay Head: ${err.message}`);
    }
  };

  // Delete Custom Pay Head
  const deletePayHead = async (id: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'payheads', id));
      toast.success(`Pay Head '${name}' deleted successfully!`);
    } catch (err: any) {
      toast.error(`Failed to delete Pay Head: ${err.message}`);
    }
  };

  // Perform actual write/recalculation for payroll to firestore
  const executeSavePayroll = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany?.id) return;

    if (employees.length === 0) {
      toast.error("Please add employees before processing payroll.");
      return;
    }

    if (draftRecords.length === 0) {
      toast.error("Wages calculation sheet is empty. Please verify employees have active configurations.");
      return;
    }

    const payload: Omit<PayRun, 'id'> = {
      month: selectedPayMonth,
      notes: notes.trim(),
      companyId: activeCompany.id,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      records: draftRecords
    };

    const existingRun = payruns.find(run => run.month === selectedPayMonth);

    try {
      if (existingRun?.id) {
        // Update existing run
        await updateDoc(doc(db, 'payruns', existingRun.id), {
          ...payload,
          createdAt: existingRun.createdAt,
          updatedAt: new Date().toISOString()
        });
        toast.success(`Payroll for ${selectedPayMonth} recalculated & updated successfully!`);
      } else {
        // Create new
        await addDoc(collection(db, 'payruns'), payload);
        toast.success(`Payroll for ${selectedPayMonth} posted successfully!`);
      }
      setNotes('');
      setShowOverwriteConfirm(false);
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message}`);
    }
  };

  // Process Payroll Calculations for selection
  const handleGeneratePayroll = async () => {
    if (employees.length === 0) {
      toast.error("Please add employees before processing payroll.");
      return;
    }

    if (draftRecords.length === 0) {
      toast.error("Wages calculation sheet is empty. Please verify employees have active configurations.");
      return;
    }

    // Check if payroll already run for this month
    const existingRun = payruns.find(run => run.month === selectedPayMonth);
    if (existingRun) {
      setShowOverwriteConfirm(true);
    } else {
      await executeSavePayroll();
    }
  };

  // Convert numbers to currency format
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Helper: Indian Rupees in words converter
  const convertNumberToWords = (num: number): string => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const nStr = ('000000000' + num).substr(-9);
    const crores = parseInt(nStr.substr(0, 2), 10);
    const lakhs = parseInt(nStr.substr(2, 2), 10);
    const thousands = parseInt(nStr.substr(4, 2), 10);
    const hundreds = parseInt(nStr.substr(6, 1), 10);
    const tens = parseInt(nStr.substr(7, 2), 10);

    let words = '';

    if (crores > 0) {
      words += (a[crores] || b[Math.floor(crores / 10)] + ' ' + a[crores % 10]) + 'Crore ';
    }
    if (lakhs > 0) {
      words += (a[lakhs] || b[Math.floor(lakhs / 10)] + ' ' + a[lakhs % 10]) + 'Lakh ';
    }
    if (thousands > 0) {
      words += (a[thousands] || b[Math.floor(thousands / 10)] + ' ' + a[thousands % 10]) + 'Thousand ';
    }
    if (hundreds > 0) {
      words += a[hundreds] + 'Hundred ';
    }
    if (tens > 0) {
      if (tens < 20) {
        words += a[tens];
      } else {
        words += b[Math.floor(tens / 10)] + ' ' + a[tens % 10];
      }
    }

    return 'Rupees ' + words.trim() + ' Only';
  };

  // Custom formatted month string
  const formatMonthYearLabel = (monthCode: string) => {
    if (!monthCode) return '';
    const [year, month] = monthCode.split('-');
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  // Fetch individual record pf/joining details from employee list
  const getEmpDetailsForPayslip = (empId: string) => {
    return employees.find(e => e.id === empId);
  };

  const handlePrint = () => generatePayslipPDF('print');
  const handleDownloadPDF = () => generatePayslipPDF('download');

  const generatePayslipPDF = async (action: 'download' | 'print') => {
    if (!selectedPayslip) return;
    
    const element = document.getElementById('payslip-print-area');
    if (!element) {
      toast.error('Print area not found');
      return;
    }

    let loadingToast = toast.loading('Preparing Pay Slip PDF...');
    
    let printWindow: Window | null = null;
    if (action === 'print') {
      printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.dismiss(loadingToast);
        toast.error('Popup blocked. Please allow popups to print pay slip.');
        return;
      }
      printWindow.document.write('<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f3f4f6;"><div style="text-align:center;"><div style="border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;width:40px;height:40px;animation:spin 2s linear infinite;margin:0 auto 20px;"></div><div style="font-size:18px;color:#1f2937;font-weight:600;">Generating Print Preview...</div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div></body></html>');
    }

    try {
      // Use html-to-image instead of html2canvas to handle modern CSS (oklch, color-mix, etc.) natively
      const dataUrl = await toPng(element, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-print')) {
            return false;
          }
          return true;
        }
      });

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      if (action === 'download') {
        const employeeName = selectedPayslip?.name || 'employee';
        const sanitizedName = employeeName.replace(/[^a-zA-Z0-9]/g, '_');
        const monthLabel = formatMonthYearLabel(payslipRunMonth).replace(/\s+/g, '_');
        pdf.save(`Payslip_${sanitizedName}_${monthLabel}.pdf`);
        toast.dismiss(loadingToast);
        toast.success('Pay slip PDF downloaded successfully!');
      } else if (printWindow) {
        const pdfBlob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        printWindow.location.href = blobUrl;
        toast.dismiss(loadingToast);
        toast.success('Print preview ready');
      }
    } catch (error) {
      console.error('PDF process failed:', error);
      toast.dismiss(loadingToast);
      if (printWindow) printWindow.close();
      toast.error('PDF generation failed. Please try again.');
    }
  };

  return (
    <div className="font-mono text-[#002f3c] space-y-6">
      
      {/* Header */}
      <div className="border-b-2 border-[#004d5a] pb-3 flex items-center justify-between no-print">
        <div>
          <h1 className="text-base font-black uppercase tracking-widest text-[#004d5a] flex items-center gap-2">
            <Users size={18} className="text-[#ffcb2b]" />
            Payroll &amp; Salary Ledger
          </h1>
          <p className="text-[10px] text-gray-500 font-sans mt-0.5">
            Create standard Employee profiles, log Attendance cycles, auto-process pay components, and view detailed salary calculations.
          </p>
        </div>
        <div className="flex bg-[#e9f2f5] border border-slate-300 p-0.5 rounded text-xs leading-none font-bold">
          <button 
            onClick={() => setActiveTab('employees')}
            className={`px-3 py-1.5 uppercase rounded-sm ${activeTab === 'employees' ? 'bg-[#146e85] text-white' : 'text-slate-600 hover:text-[#146e85]'}`}
          >
            [1] Employees
          </button>
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 uppercase rounded-sm ${activeTab === 'attendance' ? 'bg-[#146e85] text-white' : 'text-slate-600 hover:text-[#146e85]'}`}
          >
            [2] Attendance
          </button>
          <button 
            onClick={() => setActiveTab('generate')}
            className={`px-3 py-1.5 uppercase rounded-sm ${activeTab === 'generate' ? 'bg-[#146e85] text-white' : 'text-slate-600 hover:text-[#146e85]'}`}
          >
            [3] Process Wages
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#146e85] mx-auto"></div>
          <p className="text-xs text-sans text-slate-500 mt-2">Loading payroll modules...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: EMPLOYEES LIST & FORM */}
          {activeTab === 'employees' && (
            <div className="space-y-6 no-print">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#004d5a] flex items-center gap-1.5 border-b border-dashed border-slate-300 pb-1">
                  <UsersRound size={15} />
                  Employee Master Records ({employees.length})
                </h3>
                <button
                  onClick={() => setShowEmployeeForm(true)}
                  className="bg-[#146e85] hover:bg-[#0f5466] text-white px-3.5 py-1.5 text-xs font-bold uppercase inline-flex items-center gap-1.5 shadow-sm"
                >
                  <UserPlus size={13} />
                  <span>Create Employee</span>
                </button>
              </div>

              {/* Employee table */}
              <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#e9f2f5] border-b border-slate-300 text-[10px] text-slate-700 uppercase tracking-widest font-bold">
                      <th className="p-3">ID</th>
                      <th className="p-3">Employee Name</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Designation</th>
                      <th className="p-3 text-right">Basic Wages</th>
                      <th className="p-3">Date of Joining</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-sans text-slate-500">
                          No employees configured yet. Click "Create Employee" above to configure wages.
                        </td>
                      </tr>
                    ) : (
                      employees.map(emp => (
                        <tr key={emp.id} className="hover:bg-[#fafcfd]">
                          <td className="p-3 font-bold text-slate-800">{emp.employeeId}</td>
                          <td className="p-3">
                            <div className="font-bold">{emp.name}</div>
                            {emp.pfNumber && <span className="text-[10px] text-slate-400 font-mono block">PF: {emp.pfNumber}</span>}
                          </td>
                          <td className="p-3 text-slate-600">{emp.department || '-'}</td>
                          <td className="p-3 text-slate-600">{emp.designation || '-'}</td>
                          <td className="p-3 text-right font-bold text-[#146e85]">{formatCurrency(emp.basicPay)}</td>
                          <td className="p-3 text-slate-500">{emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString() : '-'}</td>
                          <td className="p-3 text-center">
                            <div className="inline-flex gap-2">
                              {empDeleteConfirmId === emp.id ? (
                                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded-sm">
                                  <span className="text-[9px] text-rose-700 font-bold uppercase">Confirm?</span>
                                  <button
                                    onClick={() => {
                                      deleteEmployee(emp.id!, emp.name);
                                      setEmpDeleteConfirmId(null);
                                    }}
                                    className="bg-rose-600 text-white hover:bg-rose-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setEmpDeleteConfirmId(null)}
                                    className="bg-slate-200 text-slate-800 hover:bg-slate-300 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditEmployee(emp)}
                                    className="p-1 hover:bg-slate-100 text-slate-600 hover:text-cyan-700"
                                    title="Edit"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => setEmpDeleteConfirmId(emp.id || null)}
                                    className="p-1 hover:bg-rose-50 text-slate-600 hover:text-rose-600"
                                    title="Delete"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE ENTRY GRID */}
          {activeTab === 'attendance' && (
            <div className="space-y-6 no-print">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-slate-200 pb-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#004d5a] flex items-center gap-1.5">
                    <Clipboard size={15} />
                    Monthly Attendance &amp; Overtime Sheets
                  </h3>
                  <p className="text-[10px] text-sans text-slate-500 mt-1">
                    Present days and overtime logs specified here directly dictate monthly calculations.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Period:</label>
                  <input
                    type="month"
                    value={attendanceMonth}
                    onChange={(e) => {
                      setAttendanceMonth(e.target.value);
                      setAttendanceMonth(e.target.value);
                      setSelectedPayMonth(e.target.value);
                    }}
                    className="px-2 py-1 text-xs border border-slate-300 focus:border-[#146e85] outline-none font-bold"
                  />
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#e9f2f5] border-b border-slate-300 text-[10px] text-slate-700 uppercase tracking-widest font-bold">
                      <th className="p-3 w-32">Emp ID</th>
                      <th className="p-3">Employee Name</th>
                      <th className="p-3 w-40 text-center">Present Days</th>
                      <th className="p-3 w-40 text-center">Overtime Hours</th>
                      <th className="p-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sans text-slate-500">
                          Please register employees in the "Employees" tab first.
                        </td>
                      </tr>
                    ) : (
                      employees.map(emp => {
                        const rec = attendanceSheet[emp.id || ''] || {
                          employeeId: emp.id || '',
                          presentDays: 30,
                          overtimeHours: 0,
                          remarks: ''
                        };

                        return (
                          <tr key={emp.id} className="hover:bg-[#fafcfd]">
                            <td className="p-3 font-bold text-slate-800 uppercase">{emp.employeeId}</td>
                            <td className="p-3">
                              <div className="font-bold">{emp.name}</div>
                              <div className="text-[10px] text-slate-400 font-sans">{emp.designation || 'Staff'}</div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-1.5 justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="31"
                                  value={rec.presentDays}
                                  onChange={(e) => updateAttendanceCell(emp.id!, 'presentDays', e.target.value)}
                                  className="w-16 text-center py-1 border border-slate-300 focus:border-[#146e85] outline-none font-bold px-1"
                                />
                                <span className="text-[10px] text-slate-400 font-sans uppercase">Days</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center gap-1.5 justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={rec.overtimeHours}
                                  onChange={(e) => updateAttendanceCell(emp.id!, 'overtimeHours', e.target.value)}
                                  className="w-16 text-center py-1 border border-slate-300 focus:border-[#146e85] outline-none font-bold px-1"
                                />
                                <span className="text-[10px] text-slate-400 font-sans uppercase">Hrs</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                placeholder="..."
                                value={rec.remarks}
                                onChange={(e) => updateAttendanceCell(emp.id!, 'remarks', e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-200 outline-none focus:border-slate-400"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {employees.length > 0 && (
                <div className="text-right">
                  <button
                    onClick={() => {
                      setActiveTab('generate');
                      toast.success("Attendance synced. Please review wage parameters before posting.");
                    }}
                    className="bg-[#146e85] hover:bg-[#0f5466] text-white px-5 py-2 text-xs font-bold uppercase shadow-sm inline-flex items-center gap-1.5"
                  >
                    <span>Proceed to Wages calculation</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GENERATE PAYROLL & HISTORIC PAY RUNS */}
          {activeTab === 'generate' && (
            <div className="space-y-6 no-print">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* Processing Panel & Customizable Rules */}
                <div className="lg:col-span-1 bg-white border border-slate-200 p-4 space-y-4 shadow-sm h-fit">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#004d5a] border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <Activity size={14} className="text-green-600" />
                    Process Wages Period
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Target payroll month</label>
                      <input
                        type="month"
                        value={selectedPayMonth}
                        onChange={(e) => {
                          setSelectedPayMonth(e.target.value);
                          setAttendanceMonth(e.target.value);
                        }}
                        className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 font-bold outline-none focus:bg-white focus:border-[#146e85]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Narration / Voucher Notes</label>
                      <textarea
                        rows={3}
                        placeholder="e.g. Salary processing for June 2026. Paid via commercial bank online."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full p-2 text-xs bg-slate-50 border border-slate-300 outline-none focus:bg-white resize-none"
                      />
                    </div>

                    {/* Customizable Invariants Base Coefficients */}
                    <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-3">
                      <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wide border-b border-slate-200 pb-1">
                        Default Rates Matrix (Manual rules)
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">HRA (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={hraRate}
                            onChange={(e) => setHraRate(Number(e.target.value) || 0)}
                            className="w-full px-1.5 py-0.5 border border-slate-300 rounded font-bold outline-none bg-white focus:border-[#146e85] text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">DA (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={daRate}
                            onChange={(e) => setDaRate(Number(e.target.value) || 0)}
                            className="w-full px-1.5 py-0.5 border border-slate-300 rounded font-bold outline-none bg-white focus:border-[#146e85] text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">PF (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={pfRate}
                            onChange={(e) => setPfRate(Number(e.target.value) || 0)}
                            className="w-full px-1.5 py-0.5 border border-slate-300 rounded font-bold outline-none bg-white focus:border-[#146e85] text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">PT Flat (Rs)</label>
                          <input
                            type="number"
                            min="0"
                            value={ptFlat}
                            onChange={(e) => setPtFlat(Number(e.target.value) || 0)}
                            className="w-full px-1.5 py-0.5 border border-slate-300 rounded font-bold outline-none bg-white focus:border-[#146e85] text-center"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">OT x-Multiplier</label>
                          <input
                            type="number"
                            step="0.1"
                            min="1"
                            value={otMultiplier}
                            onChange={(e) => setOtMultiplier(Number(e.target.value) || 0)}
                            className="w-full px-1.5 py-0.5 border border-slate-300 rounded font-bold outline-none bg-white focus:border-[#146e85] text-center"
                          />
                        </div>
                      </div>
                      <div className="text-[9px] leading-relaxed text-slate-500 font-sans italic pt-1 border-t border-dashed border-slate-200">
                        * Adjusting default rates will recalculate active table cards. You can still type custom overrides directly on the spreadsheet cells!
                      </div>
                    </div>

                    <button
                      onClick={handleGeneratePayroll}
                      className="w-full bg-[#146e85] hover:bg-[#0f5466] text-white py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <CheckCircle2 size={14} />
                      Post Wage Run Voucher
                    </button>

                    <button
                      type="button"
                      onClick={handleResetToDefaultFormulas}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 text-[10px] font-bold uppercase border border-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>🔄 Reset to Default Formulas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingPayHead(null);
                        setPayHeadName('');
                        setPayHeadType('earning');
                        setPayHeadCalcType('flat');
                        setPayHeadDefaultValue(0);
                        setShowPayHeadsModal(true);
                      }}
                      className="w-full bg-[#ffcb2b] hover:bg-[#e4b31a] text-slate-900 py-1.5 text-[10px] font-bold uppercase border border-[#e4b31a] flex items-center justify-center gap-1.5 transition-colors shadow-sm animate-pulse-once"
                    >
                      <span>⚙️ Custom Pay Heads Master</span>
                    </button>
                  </div>
                </div>

                {/* Spreadsheet matrix and history */}
                <div className="lg:col-span-3 space-y-6">
                  
                  {/* Wages Calculation Spreadsheet */}
                  <div className="bg-white border border-slate-200 p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-[#004d5a] flex items-center gap-1.5">
                          <Grid2X2 size={14} className="text-amber-500" />
                          Wages Calculation Ledger (Interactive Override Sheet)
                        </h4>
                        <p className="text-[10px] uppercase font-sans text-slate-500 font-bold tracking-tight">
                          Type custom amounts in any cell to configure custom salaries or manually adjust calculation rules.
                        </p>
                      </div>
                      <span className="bg-[#e9f2f5] border border-cyan-300 text-cyan-800 text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider font-mono">
                        [Active Voucher Editor]
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#e9f2f5] border-b border-slate-300 text-[10px] text-slate-700 uppercase tracking-tight font-bold">
                            <th className="p-2 min-w-[130px]">Employee details</th>
                            <th className="p-2 text-center min-w-[70px]">Attendance</th>
                            <th className="p-2 text-right min-w-[80px]">Basic Earned</th>
                            <th className="p-2 text-right min-w-[75px]">HRA (Allow)</th>
                            <th className="p-2 text-right min-w-[75px]">DA (Allow)</th>
                            <th className="p-2 text-right min-w-[75px]">OT Pay</th>
                            
                            {/* Custom Earning heads columns */}
                            {customEarningHeads.map(ph => (
                              <th key={ph.id} className="p-2 text-right min-w-[80px] bg-emerald-50 text-emerald-800 border-x border-slate-200">
                                {ph.name} (Earn)
                              </th>
                            ))}

                            <th className="p-2 text-right min-w-[75px]">PF Ded</th>
                            <th className="p-2 text-right min-w-[75px]">PT Ded</th>

                            {/* Custom Deduction heads columns */}
                            {customDeductionHeads.map(ph => (
                              <th key={ph.id} className="p-2 text-right min-w-[80px] bg-rose-50 text-rose-800 border-x border-slate-200">
                                {ph.name} (Ded)
                              </th>
                            ))}

                            <th className="p-2 text-right min-w-[95px]">Net Pay (Inr)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs font-mono">
                          {draftRecords.length === 0 ? (
                            <tr>
                              <td colSpan={9 + customEarningHeads.length + customDeductionHeads.length} className="p-8 text-center text-sans text-slate-500">
                                No employees to process. Please complete registration in and sync days first.
                              </td>
                            </tr>
                          ) : (
                            draftRecords.map(rec => (
                              <tr key={rec.employeeId} className="hover:bg-slate-50/60">
                                <td className="p-2 text-sans">
                                  <div className="font-bold text-slate-800">{rec.name}</div>
                                  <div className="text-[9px] text-slate-400 font-mono uppercase">{rec.employeeCode} | {rec.designation || 'Staff'}</div>
                                </td>
                                <td className="p-2 text-center text-[10px]">
                                  <span className="font-bold text-cyan-700">{rec.presentDays} Days</span>
                                  {rec.overtimeHours > 0 && <span className="text-[9px] text-amber-600 block font-mono">+{rec.overtimeHours} hrs OT</span>}
                                </td>
                                
                                {/* Basic Earned input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.earnings.basic}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'earnings', 'basic', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-cyan-700 outline-none text-xs font-bold"
                                  />
                                  <span className="text-[8px] text-slate-400 font-sans block mt-0.5">Base: {Math.round(rec.basicPay)}</span>
                                </td>

                                {/* HRA input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.earnings.hra}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'earnings', 'hra', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-cyan-700 outline-none text-xs font-bold"
                                  />
                                </td>

                                {/* DA input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.earnings.da}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'earnings', 'da', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-cyan-700 outline-none text-xs font-bold"
                                  />
                                </td>

                                {/* Overtime input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.earnings.overtime}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'earnings', 'overtime', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-cyan-700 outline-none text-xs font-bold"
                                  />
                                </td>

                                {/* Customizable dynamic Earnings inputs */}
                                {customEarningHeads.map(ph => (
                                  <td key={ph.id} className="p-1 text-right bg-emerald-50/10 border-x border-slate-200/50">
                                    <input
                                      type="number"
                                      value={(rec.customEarnings && rec.customEarnings[ph.name]) ?? 0}
                                      onChange={(e) => updateDraftCustomCell(rec.employeeId, 'earnings', ph.name, e.target.value)}
                                      className="w-full p-1 text-right bg-white border border-emerald-200 focus:border-emerald-600 outline-none text-xs font-bold text-emerald-800"
                                    />
                                  </td>
                                ))}

                                {/* PF input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.deductions.pf}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'deductions', 'pf', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-rose-700 outline-none text-xs font-bold text-rose-700"
                                  />
                                </td>

                                {/* PT input */}
                                <td className="p-1 text-right">
                                  <input
                                    type="number"
                                    value={rec.deductions.pt}
                                    onChange={(e) => updateDraftCell(rec.employeeId, 'deductions', 'pt', e.target.value)}
                                    className="w-full p-1 text-right bg-white border border-slate-300 focus:border-rose-700 outline-none text-xs font-bold text-rose-700"
                                  />
                                </td>

                                {/* Customizable dynamic Deductions inputs */}
                                {customDeductionHeads.map(ph => (
                                  <td key={ph.id} className="p-1 text-right bg-rose-50/10 border-x border-slate-200/50">
                                    <input
                                      type="number"
                                      value={(rec.customDeductions && rec.customDeductions[ph.name]) ?? 0}
                                      onChange={(e) => updateDraftCustomCell(rec.employeeId, 'deductions', ph.name, e.target.value)}
                                      className="w-full p-1 text-right bg-white border border-rose-200 focus:border-rose-600 outline-none text-xs font-bold text-rose-700"
                                    />
                                  </td>
                                ))}

                                {/* Dynamic row net take-home */}
                                <td className="p-2 text-right font-black text-[#146e85] text-xs">
                                  {formatCurrency(rec.netPay)}
                                  <div className="text-[8px] text-slate-400 tracking-tighter">
                                    {rec.earnings.total} - {rec.deductions.total}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* History & Generated Slip List */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#004d5a] flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <Grid2X2 size={15} />
                      Posted Payroll Registers / Closed Wage Slips
                    </h3>

                    {payruns.length === 0 ? (
                      <div className="bg-white border border-slate-200 p-8 text-center text-sans text-slate-500 text-xs shadow-sm">
                        No salary runs registered or posted yet. Modify active cells above and click "Post Wage Run Voucher" to save entries.
                      </div>
                    ) : (
                      payruns.map(run => (
                        <div key={run.id} className="bg-white border border-slate-200 p-3 shadow-sm space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div>
                              <span className="bg-[#ffeb3b] text-slate-900 border border-[#fdd835] text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                                Wage Voucher Log
                              </span>
                              <span className="ml-2 font-bold text-xs">{formatMonthYearLabel(run.month)}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">Created: {new Date(run.createdAt || '').toLocaleDateString()}</span>
                          </div>

                          <p className="text-[11px] text-slate-600 font-sans italic">
                            " {run.notes || 'Monthly Salary Distribution Run'} "
                          </p>

                          <div className="bg-slate-50 border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-slate-100 text-[9px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                  <th className="p-2">Emp Code</th>
                                  <th className="p-2">Name</th>
                                  <th className="p-2 text-right">Earnings</th>
                                  <th className="p-2 text-right">Deductions</th>
                                  <th className="p-2 text-right">Net Wages</th>
                                  <th className="p-2 text-center">Payslip</th>
                                </tr>
                              </thead>
                              <tbody className="text-[11px] font-mono">
                                {run.records.map(rec => (
                                  <tr key={rec.employeeId} className="border-b border-slate-200/60 hover:bg-white">
                                    <td className="p-2 font-bold uppercase">{rec.employeeCode}</td>
                                    <td className="p-2 font-sans">{rec.name}</td>
                                    <td className="p-2 text-right font-bold text-slate-600">{formatCurrency(rec.earnings.total)}</td>
                                    <td className="p-2 text-right font-bold text-rose-600">{formatCurrency(rec.deductions.total)}</td>
                                    <td className="p-2 text-right font-bold text-[#146e85]">{formatCurrency(rec.netPay)}</td>
                                    <td className="p-2 text-center">
                                      <button
                                        onClick={() => {
                                          setSelectedPayslip(rec);
                                          setPayslipRunMonth(run.month);
                                        }}
                                        className="bg-white hover:bg-[#146e85] hover:text-white text-[#146e85] border border-[#146e85] px-2 py-0.5 rounded text-[9px] font-bold uppercase transition"
                                      >
                                        Open Slip
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: ADD / ALTER EMPLOYEE */}
      {showEmployeeForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white border-2 border-[#146e85] shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-[#146e85] text-white p-3.5 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus size={15} />
                {editingEmployee ? 'Alter Employee Wages Profile (Alter)' : 'Create Employee Wages Profile (Create)'}
              </span>
              <button onClick={resetFormState} className="text-white hover:text-[#ffcb2b]">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleEmployeeSubmit} className="p-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* ID & Name */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Employee ID / Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-001"
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 font-bold outline-none focus:border-[#146e85] uppercase"
                    disabled={!!editingEmployee}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Employee Name *</label>
                  <input
                    type="text"
                    placeholder="Full Human Name"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 font-bold outline-none focus:border-[#146e85]"
                  />
                </div>

                {/* Designation & Department */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Accounts Executive"
                    value={empDesignation}
                    onChange={(e) => setEmpDesignation(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 outline-none focus:border-[#146e85]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Finance &amp; Admin"
                    value={empDepartment}
                    onChange={(e) => setEmpDepartment(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 outline-none focus:border-[#146e85]"
                  />
                </div>

                {/* Join Date & Salary */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Date of Joining</label>
                  <input
                    type="date"
                    value={empDateOfJoining}
                    onChange={(e) => setEmpDateOfJoining(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 outline-none focus:border-[#146e85]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Monthly Basic Wages *</label>
                  <input
                    type="number"
                    value={empBasicPay}
                    onChange={(e) => setEmpBasicPay(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-slate-300 font-bold outline-none focus:border-[#146e85]"
                  />
                </div>
              </div>

              {/* Bank Details Block */}
              <div className="bg-slate-50 p-3 border border-slate-200 rounded grid grid-cols-3 gap-2">
                <div className="col-span-3 font-semibold text-[10px] uppercase text-[#146e85] border-b pb-0.5 mb-1 flex items-center gap-1.5">
                  <Building size={12} />
                  Bank &amp; Institutional details
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">Bank Name</label>
                  <input
                    type="text"
                    placeholder="e.g. ICICI Bank"
                    value={empBankName}
                    onChange={(e) => setEmpBankName(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 outline-none bg-white focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">A/C Number</label>
                  <input
                    type="text"
                    placeholder="Account digit string"
                    value={empBankAccount}
                    onChange={(e) => setEmpBankAccount(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 outline-none bg-white focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 block mb-0.5">UAN / PF Number</label>
                  <input
                    type="text"
                    placeholder="UAN digit string"
                    value={empPfNumber}
                    onChange={(e) => setEmpPfNumber(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 outline-none bg-white focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetFormState}
                  className="px-4 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 uppercase font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#146e85] hover:bg-[#0f5466] text-white px-5 py-1.5 uppercase font-bold"
                >
                  {editingEmployee ? 'Apply Alter' : 'Create Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BEAUTIFUL PRINT-FRIENDLY PAYSLIP */}
      {selectedPayslip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div id="payslip-print-area" className="bg-white border-4 border-double border-slate-800 shadow-2xl max-w-4xl w-full p-6 space-y-4 my-8 relative printable-payslip">
            
            {/* Close / Action bar - visible on screen but strictly high focus no-print */}
            <div className="absolute top-4 right-4 flex items-center gap-2 no-print">
              <button
                onClick={handleDownloadPDF}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold uppercase flex items-center gap-1.5 shadow transition"
              >
                <Download size={13} />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                className="bg-[#146e85] hover:bg-[#0f5466] text-white px-3 py-1.5 text-xs font-bold uppercase flex items-center gap-1.5 shadow transition"
              >
                <Printer size={13} />
                Print Pay Slip
              </button>
              <button
                onClick={() => setSelectedPayslip(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 p-1.5 rounded-sm transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Payslip Header */}
            <div className="border-b border-dashed border-slate-400 pb-4 printable-header">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 text-left">
                  {activeCompany?.logoUrl && (
                    <div className="w-20 h-20 border border-slate-200 rounded overflow-hidden flex-shrink-0 bg-white shadow-sm flex items-center justify-center p-0.5">
                      <img src={activeCompany.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-[#146e85] font-black text-lg uppercase tracking-wider">{activeCompany?.name}</h2>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5 max-w-xl">{activeCompany?.address || 'Corporate Headquarters branch'}</p>
                    <div className="flex gap-4 mt-1">
                      {activeCompany?.phone && <span className="text-[9px] text-slate-400 font-sans">Phone: {activeCompany.phone}</span>}
                      {activeCompany?.email && <span className="text-[9px] text-slate-400 font-sans">Email: {activeCompany.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end flex-shrink-0">
                  <div className="border-2 border-slate-800 px-4 py-0.5 uppercase font-black text-xs tracking-wider mb-1 bg-slate-50">
                    Pay Slip
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    Official Record
                  </div>
                </div>
              </div>
              <div className="text-center mt-4">
                <div className="inline-block border-y-2 border-slate-800 px-8 py-0.5 uppercase font-bold text-xs font-mono">
                  For the month of {formatMonthYearLabel(payslipRunMonth)}
                </div>
              </div>
            </div>

            {/* Employee details matrix */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs border-b border-dashed border-slate-400 pb-3">
              <div className="space-y-1.5">
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Employee Code</span>
                  <span className="col-span-2 font-bold uppercase">: {selectedPayslip.employeeCode}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Employee Name</span>
                  <span className="col-span-2 font-bold uppercase">: {selectedPayslip.name}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Designation</span>
                  <span className="col-span-2">: {selectedPayslip.designation || 'Staff Associate'}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Department</span>
                  <span className="col-span-2">: {selectedPayslip.department || 'Operations'}</span>
                </div>
                {getEmpDetailsForPayslip(selectedPayslip.employeeId)?.dateOfJoining && (
                  <div className="grid grid-cols-3">
                    <span className="font-bold text-slate-500 uppercase text-[10px]">Date of Join</span>
                    <span className="col-span-2">: {new Date(getEmpDetailsForPayslip(selectedPayslip.employeeId)!.dateOfJoining).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 border-l border-dashed border-slate-300 pl-8">
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Bank Name</span>
                  <span className="col-span-2">: {getEmpDetailsForPayslip(selectedPayslip.employeeId)?.bankName || '-'}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Account No</span>
                  <span className="col-span-2 font-bold">: {getEmpDetailsForPayslip(selectedPayslip.employeeId)?.bankAccount || '-'}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">PF Number</span>
                  <span className="col-span-2">: {getEmpDetailsForPayslip(selectedPayslip.employeeId)?.pfNumber || '-'}</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Days Present</span>
                  <span className="col-span-2 font-bold">: {selectedPayslip.presentDays} Days</span>
                </div>
                <div className="grid grid-cols-3">
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Overtime Worked</span>
                  <span className="col-span-2">: {selectedPayslip.overtimeHours} Hrs</span>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions details columns */}
            <div className="grid grid-cols-2 border-b border-slate-800">
              {/* Earnings column */}
              <div className="border-r border-slate-800">
                <div className="grid grid-cols-3 bg-slate-100 p-2 border-b border-slate-800 font-bold text-[10px] uppercase tracking-wide">
                  <span className="col-span-2">Earnings Heads</span>
                  <span className="text-right">Amount (Rs)</span>
                </div>
                <div className="p-2 space-y-2 text-xs min-h-[9rem]">
                  <div className="grid grid-cols-3">
                    <span className="col-span-2 text-slate-600">Basic Wage Earned</span>
                    <span className="text-right font-bold">{formatCurrency(selectedPayslip.earnings.basic)}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="col-span-2 text-slate-600">House Rent Allowance (HRA)</span>
                    <span className="text-right">{formatCurrency(selectedPayslip.earnings.hra)}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="col-span-2 text-slate-600">Dearness Allowance (DA)</span>
                    <span className="text-right">{formatCurrency(selectedPayslip.earnings.da)}</span>
                  </div>
                  {selectedPayslip.earnings.overtime > 0 && (
                    <div className="grid grid-cols-3">
                      <span className="col-span-2 text-slate-600">Overtime Premium Pay</span>
                      <span className="text-right">{formatCurrency(selectedPayslip.earnings.overtime)}</span>
                    </div>
                  )}
                  {selectedPayslip.customEarnings && Object.entries(selectedPayslip.customEarnings).map(([phName, phVal]) => phVal > 0 && (
                    <div key={phName} className="grid grid-cols-3 text-emerald-800">
                      <span className="col-span-2 italic text-emerald-700">{phName} (Custom)</span>
                      <span className="text-right font-semibold">+{formatCurrency(phVal)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 bg-slate-50 p-2 font-bold border-t border-slate-300 text-xs text-[#002f3c]">
                  <span className="col-span-2 uppercase">Gross Earnings</span>
                  <span className="text-right">{formatCurrency(selectedPayslip.earnings.total)}</span>
                </div>
              </div>

              {/* Deductions column */}
              <div>
                <div className="grid grid-cols-3 bg-slate-100 p-2 border-b border-slate-800 font-bold text-[10px] uppercase tracking-wide">
                  <span className="col-span-2">Deductions Heads</span>
                  <span className="text-right">Amount (Rs)</span>
                </div>
                <div className="p-2 space-y-2 text-xs min-h-[9rem]">
                  <div className="grid grid-cols-3">
                    <span className="col-span-2 text-slate-600">Provident Fund (PF)</span>
                    <span className="text-right">{formatCurrency(selectedPayslip.deductions.pf)}</span>
                  </div>
                  <div className="grid grid-cols-3">
                    <span className="col-span-2 text-slate-600">Professional Tax (PT)</span>
                    <span className="text-right">{formatCurrency(selectedPayslip.deductions.pt)}</span>
                  </div>
                  {selectedPayslip.customDeductions && Object.entries(selectedPayslip.customDeductions).map(([phName, phVal]) => phVal > 0 && (
                    <div key={phName} className="grid grid-cols-3 text-rose-800">
                      <span className="col-span-2 italic text-rose-700">{phName} (Custom)</span>
                      <span className="text-right font-semibold">-{formatCurrency(phVal)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 bg-slate-50 p-2 font-bold border-t border-slate-300 text-xs text-[#002f3c]">
                  <span className="col-span-2 uppercase">Total Deductions</span>
                  <span className="text-right text-rose-700">{formatCurrency(selectedPayslip.deductions.total)}</span>
                </div>
              </div>
            </div>

            {/* Net Amount Summary */}
            <div className="bg-[#146e85]/10 p-4 border border-[#146e85]/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Net Take-Home Salary (Wages)</div>
                <div className="text-lg font-black text-[#146e85] shrink-0">{formatCurrency(selectedPayslip.netPay)}</div>
              </div>
              <div className="text-right sm:text-right font-sans text-[11px] text-slate-600 font-semibold italic text-sans max-w-md uppercase">
                {convertNumberToWords(selectedPayslip.netPay)}
              </div>
            </div>

            {/* Signature Area */}
            <div className="grid grid-cols-2 pt-16 text-center text-xs text-slate-600 font-bold no-print-flex">
              <div>
                <div className="border-t border-slate-300 w-48 mx-auto pt-2 uppercase text-[10px]">Employee Signature</div>
              </div>
              <div>
                <div className="border-t border-slate-300 w-48 mx-auto pt-2 uppercase text-[10px]">Director / Auth signatory</div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: CUSTOM PAY HEADS MASTER */}
      {showPayHeadsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border-4 border-double border-slate-800 shadow-2xl max-w-4xl w-full p-6 space-y-4 my-8 relative">
            
            {/* Close button */}
            <button
              onClick={() => {
                setShowPayHeadsModal(false);
                setEditingPayHead(null);
                setPayHeadName('');
                setPayHeadDefaultValue(0);
              }}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 p-1.5 rounded-sm"
            >
              <X size={15} />
            </button>

            {/* Header */}
            <div className="border-b border-slate-200 pb-2 flex items-center gap-2">
              <span className="bg-[#ffcb2b] text-slate-900 border border-[#e4b31a] text-xs font-black px-2.5 py-0.5 uppercase tracking-wide">
                ERP Master
              </span>
              <h3 className="text-sm font-black uppercase text-slate-800">
                Custom Pay Heads Master Configuration
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Part 1: Form to Add/Edit */}
              <form onSubmit={handlePayHeadSubmit} className="space-y-4 border-r border-slate-100 pr-0 md:pr-6">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded font-sans text-xs space-y-3">
                  <div className="text-[10px] font-black uppercase text-[#146e85] border-b border-slate-200 pb-1">
                    {editingPayHead ? "Alter Pay Head Definition" : "Create New Custom Pay Head"}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Pay Head Name (Unique)</label>
                    <input
                      type="text"
                      placeholder="e.g. Travel Allowance, Bonus, EPF-Voluntary"
                      value={payHeadName}
                      onChange={(e) => setPayHeadName(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 font-bold outline-none focus:border-[#146e85] uppercase text-xs"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Pay Head Type</label>
                    <select
                      value={payHeadType}
                      onChange={(e) => setPayHeadType(e.target.value as 'earning' | 'deduction')}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 outline-none focus:border-[#146e85] text-xs font-semibold"
                    >
                      <option value="earning">Earning for Employees (Increases Salary)</option>
                      <option value="deduction">Deduction for Employees (Decreases Salary)</option>
                    </select>
                  </div>

                  {/* Calculation Type */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">Calculation Basis</label>
                    <select
                      value={payHeadCalcType}
                      onChange={(e) => setPayHeadCalcType(e.target.value as 'flat' | 'percentage')}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 outline-none focus:border-[#146e85] text-xs font-semibold"
                    >
                      <option value="flat">Flat Amount (Direct Ledger Value)</option>
                      <option value="percentage">On Earned Basic Percentage (%)</option>
                    </select>
                  </div>

                  {/* Default Value */}
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5">
                      {payHeadCalcType === 'percentage' ? "Default Percentage rate (%)" : "Default Flat Amount (Rs)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={payHeadDefaultValue}
                      onChange={(e) => setPayHeadDefaultValue(Number(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-slate-300 font-bold outline-none focus:border-[#146e85] text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  {editingPayHead && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPayHead(null);
                        setPayHeadName('');
                        setPayHeadDefaultValue(0);
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 border border-slate-200 uppercase font-bold"
                    >
                      Clear Alter
                    </button>
                  )}
                  
                  <button
                    type="submit"
                    className="bg-[#146e85] hover:bg-[#0f5466] text-white px-5 py-1.5 text-xs uppercase font-bold text-center"
                  >
                    {editingPayHead ? "Apply Master Alter" : "Register Pay Head"}
                  </button>
                </div>
              </form>

              {/* Part 2: Read List of Current Custom Payheads */}
              <div className="space-y-3 font-sans">
                <div className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 pb-1 flex items-center justify-between">
                  <span>Registered Accounts / Ledger Heads ({payHeads.length})</span>
                  <span className="text-[9px] lowercase text-slate-400 font-normal italic">click to edit or delete</span>
                </div>

                {payHeads.length === 0 ? (
                  <div className="text-center p-8 bg-slate-50 text-slate-400 text-xs border border-dashed border-slate-200 rounded">
                    No custom pay heads configured yet. Fill out the ledger creation form to register allowances or deductions.
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto border border-slate-200 divide-y divide-slate-100">
                    {payHeads.map(ph => (
                      <div key={ph.id} className="p-3 hover:bg-slate-50 flex items-center justify-between text-xs transition-colors">
                        <div>
                          <div className="font-bold text-slate-800 uppercase flex items-center gap-1.5">
                            {ph.name}
                            <span className={`text-[8px] font-bold px-1.5 rounded-full ${ph.type === 'earning' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {ph.type === 'earning' ? 'EARNING' : 'DEDUCTION'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Type: {ph.calculationType === 'percentage' ? `${ph.defaultValue}% of Earned Basic` : `Flat ${formatCurrency(ph.defaultValue)}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {deleteConfirmId === ph.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded">
                              <span className="text-[9px] text-rose-700 font-bold uppercase mr-1">Confirm?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  deletePayHead(ph.id!, ph.name);
                                  setDeleteConfirmId(null);
                                }}
                                className="bg-rose-600 text-white hover:bg-rose-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="bg-slate-200 text-slate-800 hover:bg-slate-300 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPayHead(ph);
                                  setPayHeadName(ph.name);
                                  setPayHeadType(ph.type);
                                  setPayHeadCalcType(ph.calculationType);
                                  setPayHeadDefaultValue(ph.defaultValue);
                                }}
                                className="bg-sky-50 text-sky-800 hover:bg-sky-100 p-1 rounded border border-sky-200 text-[10px] uppercase font-bold"
                                title="Edit / Alter Head"
                              >
                                Alter
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(ph.id || null)}
                                className="bg-rose-50 text-rose-800 hover:bg-rose-100 p-1 rounded border border-rose-200 text-[10px] uppercase font-bold"
                                title="Delete Head"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2 text-[10px] text-slate-400 italic">
              * Active custom pay heads automatically dynamically map columns inside the interactive Wages Calculation Ledger.
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: IFRAME-SAFE PAYROLL OVERWRITE CONFIRMATION */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white border-4 border-double border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 relative">
            <button
              onClick={() => setShowOverwriteConfirm(false)}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-[#b2bec3] p-1 rounded-sm"
            >
              <X size={14} />
            </button>
            <div className="border-b border-slate-200 pb-2 flex items-center gap-2">
              <span className="bg-[#146e85] text-white border border-[#0f5466] text-[9px] font-black px-2 py-0.5 uppercase tracking-wide">
                Posting Voucher
              </span>
              <h3 className="text-xs font-black uppercase text-slate-800">
                Overwrite Payroll Warning
              </h3>
            </div>
            <p className="text-xs text-slate-600 font-sans leading-relaxed">
              Payroll for <span className="font-bold text-slate-900">{selectedPayMonth}</span> is already processed and saved in the ledger. 
              Are you sure you want to completely overwrite and recalculate this month's payslips with current draft spreadsheet records?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowOverwriteConfirm(false)}
                className="px-4 py-1.5 text-xs text-slate-800 hover:bg-slate-100 border border-slate-300 uppercase font-bold"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  executeSavePayroll();
                }}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-5 py-1.5 text-xs uppercase font-bold text-center border border-amber-600 rounded-sm"
              >
                Yes, Recalculate & Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

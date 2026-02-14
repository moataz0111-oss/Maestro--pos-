
import React, { useState, useEffect, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Printer, ArrowRight, Download } from 'lucide-react';
const API = API_URL;
export default function PayrollPrint() {
  const { payrollId } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchPayrollData();
  }, [payrollId]);
  const fetchPayrollData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/payroll/${payrollId}/print`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  const handlePrint = () => {
    window.print();
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">كشف الراتب غير موجود</p>
      </div>
    );
  }
  const { payroll, employee, branch, deductions, bonuses, advances } = data;
  return (
    <div className="min-h-screen bg-gray-100 p-4" dir="rtl">
      {/* Controls - Hidden when printing */}
      <div className="print:hidden mb-4 flex items-center justify-between max-w-3xl mx-auto">
        <Button variant="outline" onClick={() => navigate('/hr')}>
          <ArrowRight className="h-4 w-4 ml-2" />
          رجوع
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 ml-2" />
          طباعة
        </Button>
      </div>
      {/* Printable Content */}
      <div ref={printRef} className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none">
        <div className="p-8">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900">كشف راتب</h1>
            <p className="text-gray-600">Payroll Statement</p>
            <p className="text-sm text-gray-500 mt-2">
              {branch?.name || 'الفرع الرئيسي'}
            </p>
          </div>
          {/* Employee Info */}
          <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-lg print:bg-white print:border print:border-gray-300">
            <div>
              <p className="text-sm text-gray-500">اسم الموظف</p>
              <p className="font-bold text-lg">{employee?.name || payroll.employee_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">رقم الموظف</p>
              <p className="font-bold text-lg">{employee?.code || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">الوظيفة</p>
              <p className="font-medium">{employee?.position || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">القسم</p>
              <p className="font-medium">{employee?.department || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">الشهر</p>
              <p className="font-bold text-primary">{payroll.month}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">الحالة</p>
              <Badge className={payroll.status === 'paid' ? 'bg-green-500' : 'bg-yellow-500'}>
                {payroll.status === 'paid' ? 'مصروف' : 'قيد الانتظار'}
              </Badge>
            </div>
          </div>
          {/* Salary Details */}
          <div className="mb-6">
            <h2 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4">تفاصيل الراتب</h2>
            
            <table className="w-full">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-gray-600">الراتب الأساسي</td>
                  <td className="py-2 text-left font-medium">{payroll.basic_salary?.toLocaleString()} د.ع</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Bonuses */}
          {bonuses && bonuses.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 text-green-600">المكافآت والإضافات</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-green-50 print:bg-white">
                    <th className="py-2 text-right">النوع</th>
                    <th className="py-2 text-right">السبب</th>
                    <th className="py-2 text-right">التاريخ</th>
                    <th className="py-2 text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {bonuses.map((bonus, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">
                        {bonus.bonus_type === 'performance' ? 'أداء' :
                         bonus.bonus_type === 'overtime' ? 'وقت إضافي' :
                         bonus.bonus_type === 'holiday' ? 'عطلة' : 'أخرى'}
                      </td>
                      <td className="py-2">{bonus.reason}</td>
                      <td className="py-2">{bonus.date}</td>
                      <td className="py-2 text-left text-green-600">+{bonus.amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-green-50 print:bg-white">
                    <td colSpan="3" className="py-2">إجمالي المكافآت</td>
                    <td className="py-2 text-left text-green-600">+{payroll.total_bonuses?.toLocaleString()} د.ع</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Deductions */}
          {deductions && deductions.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 text-red-600">الخصومات</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-red-50 print:bg-white">
                    <th className="py-2 text-right">النوع</th>
                    <th className="py-2 text-right">السبب</th>
                    <th className="py-2 text-right">التاريخ</th>
                    <th className="py-2 text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((ded, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">
                        {ded.deduction_type === 'absence' ? 'غياب' :
                         ded.deduction_type === 'late' ? 'تأخير' :
                         ded.deduction_type === 'early_leave' ? 'انصراف مبكر' :
                         ded.deduction_type === 'violation' ? 'مخالفة' : 'أخرى'}
                      </td>
                      <td className="py-2">{ded.reason}</td>
                      <td className="py-2">{ded.date}</td>
                      <td className="py-2 text-left text-red-600">-{ded.amount?.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-red-50 print:bg-white">
                    <td colSpan="3" className="py-2">إجمالي الخصومات</td>
                    <td className="py-2 text-left text-red-600">-{payroll.total_deductions?.toLocaleString()} د.ع</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Advance Deductions */}
          {payroll.advance_deduction > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 text-orange-600">استقطاع السلف</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-orange-50 print:bg-white">
                    <th className="py-2 text-right">السلفة</th>
                    <th className="py-2 text-right">المبلغ الأصلي</th>
                    <th className="py-2 text-right">المتبقي</th>
                    <th className="py-2 text-left">الاستقطاع الشهري</th>
                  </tr>
                </thead>
                <tbody>
                  {advances?.filter(a => a.remaining_amount > 0 || a.status === 'paid').map((adv, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{adv.reason || 'سلفة'}</td>
                      <td className="py-2">{adv.amount?.toLocaleString()}</td>
                      <td className="py-2">{adv.remaining_amount?.toLocaleString()}</td>
                      <td className="py-2 text-left text-orange-600">-{adv.monthly_deduction?.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-orange-50 print:bg-white">
                    <td colSpan="3" className="py-2">إجمالي استقطاع السلف</td>
                    <td className="py-2 text-left text-orange-600">-{payroll.advance_deduction?.toLocaleString()} د.ع</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Summary */}
          <div className="border-t-2 border-gray-800 pt-4 mt-6">
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="py-2 text-gray-600">الراتب الأساسي</td>
                  <td className="py-2 text-left">{payroll.basic_salary?.toLocaleString()} د.ع</td>
                </tr>
                <tr>
                  <td className="py-2 text-green-600">+ المكافآت</td>
                  <td className="py-2 text-left text-green-600">+{payroll.total_bonuses?.toLocaleString()} د.ع</td>
                </tr>
                <tr>
                  <td className="py-2 text-red-600">- الخصومات</td>
                  <td className="py-2 text-left text-red-600">-{payroll.total_deductions?.toLocaleString()} د.ع</td>
                </tr>
                <tr>
                  <td className="py-2 text-orange-600">- استقطاع السلف</td>
                  <td className="py-2 text-left text-orange-600">-{payroll.advance_deduction?.toLocaleString()} د.ع</td>
                </tr>
                <tr className="border-t-2 border-gray-800 font-bold text-xl">
                  <td className="py-3">صافي الراتب</td>
                  <td className="py-3 text-left text-primary">{payroll.net_salary?.toLocaleString()} د.ع</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-8">توقيع الموظف</p>
                <div className="border-t border-gray-400 w-48 mx-auto"></div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-8">توقيع المسؤول</p>
                <div className="border-t border-gray-400 w-48 mx-auto"></div>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-6">
              تاريخ الطباعة: {new Date().toLocaleDateString('en-US')} - {new Date().toLocaleTimeString('en-US')}
            </p>
          </div>
        </div>
      </div>
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

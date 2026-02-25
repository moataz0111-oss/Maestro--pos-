/**
 * نظام إشعارات الطلبات في الوقت الفعلي
 * يستخدم Polling لجلب الإشعارات الجديدة وتشغيل الأصوات والطباعة التلقائية
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API_URL } from './api';
import { 
  playNewOrderNotification, 
  playDriverNotification,
  getSoundSettings 
} from './sound';

const API = API_URL;

// Hook لإدارة إشعارات الطلبات
export const useOrderNotifications = (options = {}) => {
  const {
    branchId = null,
    driverId = null,
    enabled = true,
    pollingInterval = 5000, // كل 5 ثواني
    onNewOrder = null, // callback عند وصول طلب جديد
    autoPrint = false, // طباعة تلقائية
    playSound = true,
  } = options;

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastCheckRef = useRef(Date.now());
  const processedOrdersRef = useRef(new Set());

  // جلب الإشعارات الجديدة
  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;

    try {
      const params = new URLSearchParams();
      
      if (branchId) {
        params.append('branch_id', branchId);
        params.append('notification_type', 'new_order_cashier');
      }
      
      if (driverId) {
        params.append('driver_id', driverId);
        params.append('notification_type', 'new_order_driver');
      }
      
      params.append('unread_only', 'true');

      const res = await axios.get(`${API}/order-notifications?${params.toString()}`);
      const { notifications: newNotifications, unread_count } = res.data;

      setUnreadCount(unread_count);

      // معالجة الإشعارات الجديدة
      for (const notification of newNotifications) {
        if (!processedOrdersRef.current.has(notification.id)) {
          processedOrdersRef.current.add(notification.id);
          
          // تشغيل الصوت
          const soundSettings = getSoundSettings();
          if (playSound && soundSettings.enabled && soundSettings.orderNotifications) {
            if (notification.type === 'new_order_cashier') {
              playNewOrderNotification();
            } else if (notification.type === 'new_order_driver') {
              playDriverNotification();
            }
          }

          // عرض الإشعار
          const orderTypeLabels = {
            delivery: '🚗 توصيل',
            takeaway: '🛍️ سفري',
            dine_in: '🍽️ داخلي'
          };

          const orderTypeLabel = orderTypeLabels[notification.order_type] || notification.order_type;
          
          toast.success(
            `طلب جديد! #${notification.order_number}`,
            {
              description: `${orderTypeLabel} - ${notification.items_count} أصناف - ${notification.total_amount?.toLocaleString()} IQD`,
              duration: 10000,
              action: notification.type === 'new_order_cashier' ? {
                label: 'طباعة',
                onClick: () => handlePrintOrder(notification)
              } : undefined
            }
          );

          // استدعاء callback
          if (onNewOrder) {
            onNewOrder(notification);
          }

          // طباعة تلقائية
          if (autoPrint && notification.type === 'new_order_cashier') {
            handlePrintOrder(notification);
          }
        }
      }

      setNotifications(newNotifications);
      lastCheckRef.current = Date.now();

    } catch (error) {
      console.error('Failed to fetch order notifications:', error);
    }
  }, [branchId, driverId, enabled, playSound, autoPrint, onNewOrder]);

  // طباعة الطلب
  const handlePrintOrder = async (notification) => {
    try {
      // جلب تفاصيل الطلب
      const orderRes = await axios.get(`${API}/orders/${notification.order_id}`);
      const order = orderRes.data;

      // فتح نافذة الطباعة
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      
      if (printWindow) {
        const itemsHtml = order.items?.map(item => `
          <tr>
            <td style="padding: 4px; border-bottom: 1px dashed #ddd;">${item.product_name}</td>
            <td style="padding: 4px; text-align: center; border-bottom: 1px dashed #ddd;">${item.quantity}</td>
            <td style="padding: 4px; text-align: left; border-bottom: 1px dashed #ddd;">${(item.price * item.quantity).toLocaleString()}</td>
          </tr>
        `).join('') || '';

        const orderTypeLabels = {
          delivery: 'توصيل',
          takeaway: 'سفري',
          dine_in: 'داخل المطعم'
        };

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl">
          <head>
            <meta charset="UTF-8">
            <title>طلب #${order.order_number}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 10px; font-size: 12px; }
              .header { text-align: center; margin-bottom: 10px; }
              .order-info { margin-bottom: 10px; }
              .order-info div { margin: 4px 0; }
              table { width: 100%; border-collapse: collapse; }
              th { background: #f5f5f5; padding: 6px; text-align: right; }
              .total { font-size: 16px; font-weight: bold; text-align: center; margin-top: 10px; }
              .customer-info { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h2 style="margin: 0;">🔔 طلب جديد!</h2>
              <h3 style="margin: 5px 0;">#${order.order_number}</h3>
            </div>
            
            <div class="order-info">
              <div><strong>النوع:</strong> ${orderTypeLabels[order.order_type] || order.order_type}</div>
              <div><strong>الوقت:</strong> ${new Date(order.created_at).toLocaleString('ar-IQ')}</div>
              ${order.table_id ? `<div><strong>الطاولة:</strong> ${order.table_name || order.table_id}</div>` : ''}
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th style="text-align: center;">الكمية</th>
                  <th style="text-align: left;">السعر</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            
            <div class="total">
              الإجمالي: ${order.total_amount?.toLocaleString()} IQD
            </div>
            
            ${order.customer_name || order.customer_phone || order.delivery_address ? `
              <div class="customer-info">
                <strong>معلومات العميل:</strong>
                ${order.customer_name ? `<div>الاسم: ${order.customer_name}</div>` : ''}
                ${order.customer_phone ? `<div>الهاتف: ${order.customer_phone}</div>` : ''}
                ${order.delivery_address ? `<div>العنوان: ${order.delivery_address}</div>` : ''}
              </div>
            ` : ''}
            
            ${order.notes ? `<div style="margin-top: 10px;"><strong>ملاحظات:</strong> ${order.notes}</div>` : ''}
            
            <script>
              window.onload = function() {
                window.print();
              }
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }

      // تحديد الإشعار كمطبوع
      await axios.put(`${API}/order-notifications/${notification.id}/printed`);

    } catch (error) {
      console.error('Failed to print order:', error);
      toast.error('فشل في طباعة الطلب');
    }
  };

  // تحديد إشعار كمقروء
  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/order-notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // تحديد الكل كمقروء
  const markAllAsRead = async () => {
    try {
      const params = new URLSearchParams();
      if (branchId) params.append('branch_id', branchId);
      if (driverId) params.append('driver_id', driverId);
      
      await axios.put(`${API}/order-notifications/read-all?${params.toString()}`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // بدء Polling
  useEffect(() => {
    if (!enabled) return;

    // جلب فوري
    fetchNotifications();

    // جلب دوري
    const interval = setInterval(fetchNotifications, pollingInterval);

    return () => clearInterval(interval);
  }, [enabled, pollingInterval, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
    printOrder: handlePrintOrder
  };
};

// دالة مساعدة لإرسال إشعار عند حفظ طلب
export const sendOrderNotification = async (orderData) => {
  try {
    const notificationData = {
      order_id: orderData.id,
      order_number: orderData.order_number,
      branch_id: orderData.branch_id,
      order_type: orderData.order_type,
      customer_name: orderData.customer_name || null,
      customer_phone: orderData.customer_phone || null,
      delivery_address: orderData.delivery_address || null,
      driver_id: orderData.driver_id || null,
      total_amount: orderData.total_amount || 0,
      items_count: orderData.items?.length || 0,
      notes: orderData.notes || null
    };

    await axios.post(`${API}/order-notifications`, notificationData);
    return true;
  } catch (error) {
    console.error('Failed to send order notification:', error);
    return false;
  }
};

export default {
  useOrderNotifications,
  sendOrderNotification
};

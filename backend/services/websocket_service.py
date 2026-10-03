"""
نظام WebSocket للإشعارات في الوقت الفعلي
يستبدل Polling بـ WebSocket لتحسين الأداء والاستجابة
"""
import socketio
from typing import Dict, Set
import logging

logger = logging.getLogger(__name__)

# إنشاء سيرفر Socket.IO
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False
)

# تخزين الاتصالات حسب الفرع والسائق
branch_connections: Dict[str, Set[str]] = {}  # branch_id -> set of sid
driver_connections: Dict[str, str] = {}  # driver_id -> sid
user_connections: Dict[str, str] = {}  # user_id -> sid


@sio.event
async def connect(sid, environ):
    """عند اتصال عميل جديد"""
    logger.info(f"🔌 Client connected: {sid}")
    await sio.emit('connected', {'sid': sid}, to=sid)


@sio.event
async def disconnect(sid):
    """عند قطع اتصال عميل"""
    logger.info(f"❌ Client disconnected: {sid}")
    
    # إزالة من قوائم الاتصالات
    for branch_id, sids in list(branch_connections.items()):
        if sid in sids:
            sids.discard(sid)
            if not sids:
                del branch_connections[branch_id]
    
    for driver_id, driver_sid in list(driver_connections.items()):
        if driver_sid == sid:
            del driver_connections[driver_id]
    
    for user_id, user_sid in list(user_connections.items()):
        if user_sid == sid:
            del user_connections[user_id]


@sio.event
async def join_branch(sid, data):
    """انضمام كاشير لغرفة الفرع"""
    branch_id = data.get('branch_id')
    user_id = data.get('user_id')
    
    if branch_id:
        if branch_id not in branch_connections:
            branch_connections[branch_id] = set()
        branch_connections[branch_id].add(sid)
        
        if user_id:
            user_connections[user_id] = sid
        
        await sio.enter_room(sid, f'branch_{branch_id}')
        logger.info(f"✅ Client {sid} joined branch {branch_id}")
        await sio.emit('joined_branch', {'branch_id': branch_id}, to=sid)


@sio.event
async def join_driver(sid, data):
    """انضمام سائق للاستماع للإشعارات"""
    driver_id = data.get('driver_id')
    
    if driver_id:
        driver_connections[driver_id] = sid
        await sio.enter_room(sid, f'driver_{driver_id}')
        logger.info(f"🚗 Driver {driver_id} connected: {sid}")
        await sio.emit('joined_driver', {'driver_id': driver_id}, to=sid)


async def notify_branch_new_order(branch_id: str, order_data: dict):
    """
    إرسال إشعار طلب جديد لجميع الكاشيرين في الفرع
    """
    room = f'branch_{branch_id}'
    await sio.emit('new_order', {
        'type': 'new_order_cashier',
        'order_id': order_data.get('order_id'),
        'order_number': order_data.get('order_number'),
        'order_type': order_data.get('order_type'),
        'customer_name': order_data.get('customer_name'),
        'customer_phone': order_data.get('customer_phone'),
        'delivery_address': order_data.get('delivery_address'),
        'total_amount': order_data.get('total_amount'),
        'items_count': order_data.get('items_count'),
        'notes': order_data.get('notes'),
        'branch_id': branch_id
    }, room=room)
    logger.info(f"📢 New order notification sent to branch {branch_id}")


async def notify_driver_new_order(driver_id: str, order_data: dict):
    """
    إرسال إشعار طلب جديد للسائق المحدد
    """
    room = f'driver_{driver_id}'
    await sio.emit('new_order', {
        'type': 'new_order_driver',
        'order_id': order_data.get('order_id'),
        'order_number': order_data.get('order_number'),
        'customer_name': order_data.get('customer_name'),
        'customer_phone': order_data.get('customer_phone'),
        'delivery_address': order_data.get('delivery_address'),
        'total_amount': order_data.get('total_amount'),
        'branch_id': order_data.get('branch_id'),
        'driver_id': driver_id
    }, room=room)
    logger.info(f"🚗 New order notification sent to driver {driver_id}")


async def notify_order_status_change(order_id: str, new_status: str, branch_id: str = None, driver_id: str = None):
    """
    إرسال إشعار تغيير حالة الطلب
    """
    data = {
        'type': 'order_status_change',
        'order_id': order_id,
        'new_status': new_status
    }
    
    if branch_id:
        await sio.emit('order_update', data, room=f'branch_{branch_id}')
    
    if driver_id:
        await sio.emit('order_update', data, room=f'driver_{driver_id}')


def get_socket_app():
    """إرجاع تطبيق Socket.IO ASGI"""
    return socketio.ASGIApp(sio)


# ==================== Enterprise Mode Live Updates ====================
async def notify_enterprise_update(tenant_id: str, project_id: str, event_type: str, data: dict = None):
    """
    بث حدث لحوض المؤسسة — يستمع مالك المؤسسة لتحديث Enterprise Dashboard لحظياً.
    event_type: order_created | order_updated | expense_added | shift_closed
    """
    room = f'enterprise_{tenant_id}'
    payload = {
        'type': event_type,
        'tenant_id': tenant_id,
        'project_id': project_id,
        'data': data or {},
    }
    await sio.emit('enterprise_update', payload, room=room)
    logger.info(f"📊 Enterprise update: {event_type} tenant={tenant_id} project={project_id}")


@sio.event
async def join_enterprise(sid, data):
    """اشتراك مالك المؤسسة في تحديثات كل مشاريعه"""
    tenant_id = data.get('tenant_id')
    if not tenant_id:
        return {'status': 'error', 'message': 'tenant_id required'}
    room = f'enterprise_{tenant_id}'
    await sio.enter_room(sid, room)
    logger.info(f"🏢 Owner joined enterprise room: {room}")
    return {'status': 'ok', 'room': room}


# للاستخدام المباشر
socket_app = get_socket_app()

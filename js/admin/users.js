import { supabase, DB_TABLES } from '../config/supabase.js';

const tbody = document.getElementById('usersTableBody');
const userForm = document.getElementById('userForm');

let allUsers = []; 

// ==========================================
// 🛡️ استخراج بيانات المدير الحالي من الجلسة
// ==========================================
const sessionString = localStorage.getItem('resq_custom_session');
const currentAdmin = sessionString ? JSON.parse(sessionString) : null;
const currentAdminId = currentAdmin ? currentAdmin.id : null;

// ==========================================
// 📝 دالة تسجيل تحركات النظام (Audit Logger)
// ==========================================
async function logSystemAction(action, targetTable, targetId, note) {
    if (!currentAdminId) return;
    try {
        await supabase.from('audit_admin_changes').insert([{
            admin_user_id: currentAdminId,
            action: action,           // 'CREATE', 'UPDATE', 'DELETE'
            target_table: targetTable, // 'users'
            target_id: targetId,       // ID of the modified user
            note: note                 // التفاصيل
        }]);
    } catch (error) {
        console.error("Audit Log Failed:", error);
    }
}

// ==========================================
// 1. جلب البيانات من الخادم
// ==========================================
window.loadUsersData = async function() {
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i> Loading...</td></tr>';
    
    const { data, error } = await supabase.from(DB_TABLES.USERS).select('*').order('id', { ascending: false });
    
    if (error) {
        window.showToast("Failed to load users data.", "error");
        return;
    }

    allUsers = data;
    applyFilters(); 
};

// ==========================================
// 2. نظام الفلترة والبحث اللحظي
// ==========================================
function applyFilters() {
    const searchTerm = document.getElementById('userSearchInput')?.value.toLowerCase() || "";
    const roleTerm = document.getElementById('roleFilter')?.value || "";
    const statusTerm = document.getElementById('statusFilter')?.value || "";

    const filteredUsers = allUsers.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(searchTerm) || 
                              u.email.toLowerCase().includes(searchTerm) || 
                              u.id.toString().includes(searchTerm) ||
                              (u.phone && u.phone.includes(searchTerm));
                              
        const matchesRole = roleTerm === "" || u.role === roleTerm;
        const matchesStatus = statusTerm === "" || u.is_active.toString() === statusTerm;

        return matchesSearch && matchesRole && matchesStatus;
    });

    renderUsersTable(filteredUsers);
}

document.getElementById('userSearchInput')?.addEventListener('input', applyFilters);
document.getElementById('roleFilter')?.addEventListener('change', applyFilters);
document.getElementById('statusFilter')?.addEventListener('change', applyFilters);

// ==========================================
// 3. رسم الجدول (مع حماية بيانات المديرين)
// ==========================================
function renderUsersTable(usersData) {
    if (usersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500 font-bold">No users match your criteria.</td></tr>';
        return;
    }

    tbody.innerHTML = usersData.map(u => {
        let roleColor = u.role === 'admin' ? 'bg-purple-500/20 text-purple-500 border-purple-500/30' : 
                        u.role === 'hospital' ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' : 
                        u.role === 'driver' ? 'bg-green-500/20 text-green-500 border-green-500/30' : 'bg-gray-500/20 text-gray-500 border-gray-500/30';
        
        // 🛡️ التحقق من الصلاحيات (Authorization Check)
        const isSelf = u.id === currentAdminId;
        const isOtherAdmin = u.role === 'admin' && !isSelf;

        let actionButtons = '';
        if (isOtherAdmin) {
            // أدمن آخر: يمكنه المشاهدة فقط، التعديل والحذف محظور
            actionButtons = `
                <button onclick="viewUserDetails(${u.id})" class="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"><i class="fa-solid fa-eye text-xs"></i></button>
                <span class="text-[10px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded cursor-not-allowed ml-2" title="Restricted: Cannot edit other Admins">Restricted</span>
            `;
        } else {
            // مستخدم عادي، مستشفى، سائق، أو نفس الأدمن الحالي
            actionButtons = `
                <button onclick="viewUserDetails(${u.id})" class="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-blue-500 hover:text-white rounded-lg transition-colors shadow-sm" title="View Details"><i class="fa-solid fa-eye text-xs"></i></button>
                <button onclick="editUser(${u.id})" class="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-warning hover:text-white rounded-lg transition-colors shadow-sm" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>
                <button onclick="deleteUser(${u.id})" class="w-8 h-8 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors shadow-sm ${isSelf ? 'hidden' : ''}" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>
            `;
        }
                        
        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5">
            <td class="p-4 font-mono text-xs text-gray-500 dark:text-gray-400">#${u.id}</td>
            <td class="p-4 font-bold text-gray-800 dark:text-white">
                ${u.name} ${isSelf ? '<span class="ml-2 text-[9px] bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded uppercase">You</span>' : ''}
            </td>
            <td class="p-4 text-xs text-gray-600 dark:text-gray-300">${u.email}</td>
            <td class="p-4 font-mono text-xs text-gray-600 dark:text-gray-300">${u.phone || '-'}</td>
            <td class="p-4"><span class="px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${roleColor}">${u.role}</span></td>
            <td class="p-4">
                <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full ${u.is_active ? 'bg-success' : 'bg-red-500'}"></span>
                    <span class="text-xs font-bold ${u.is_active ? 'text-success' : 'text-red-500'}">${u.is_active ? 'Active' : 'Suspended'}</span>
                </span>
            </td>
            <td class="p-4">
                <div class="flex items-center justify-center gap-2">
                    ${actionButtons}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// ==========================================
// 4. العمليات الإدارية (View, Add, Edit, Delete)
// ==========================================

window.viewUserDetails = function(id) {
    const user = allUsers.find(u => u.id === id);
    if(!user) return;

    let roleColor = user.role === 'admin' ? 'text-purple-500' : user.role === 'hospital' ? 'text-blue-500' : user.role === 'driver' ? 'text-green-500' : 'text-gray-500';

    document.getElementById('viewDetailsContent').innerHTML = `
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">User ID</span> <span class="font-mono dark:text-white">#${user.id}</span></div>
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">Full Name</span> <span class="font-bold dark:text-white">${user.name}</span></div>
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">Email Address</span> <span class="dark:text-white">${user.email}</span></div>
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">Phone Number</span> <span class="font-mono dark:text-white">${user.phone || 'Not Provided'}</span></div>
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">Assigned Role</span> <span class="uppercase font-bold tracking-wider ${roleColor}">${user.role}</span></div>
        <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2"><span class="text-gray-500 font-bold">Account Status</span> <span class="font-bold ${user.is_active ? 'text-success' : 'text-red-500'}">${user.is_active ? 'Active Account' : 'Suspended'}</span></div>
        <div class="flex justify-between"><span class="text-gray-500 font-bold">Member Since</span> <span class="text-xs text-gray-500">${new Date(user.created_at).toLocaleDateString()}</span></div>
    `;

    const m = document.getElementById('viewDetailsModal');
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.children[0].classList.remove('scale-95'); }, 10);
};

window.openUserModal = function() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = ''; 
    document.getElementById('userModalTitle').innerText = 'Add New User';
    document.getElementById('saveUserBtn').innerText = 'Save User';
    document.getElementById('userPassword').required = true; 
    
    const m = document.getElementById('userModal');
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.children[0].classList.remove('scale-95'); }, 10);
};

window.editUser = function(id) {
    const user = allUsers.find(u => u.id === id);
    if(!user) return;

    // 🛡️ حماية إضافية قبل فتح النافذة
    if (user.role === 'admin' && user.id !== currentAdminId) {
        window.showToast("Unauthorized: Cannot edit other administrators.", "error");
        return;
    }

    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userRole').value = user.role;
    
    const pwdInput = document.getElementById('userPassword');
    pwdInput.value = ''; pwdInput.required = false; pwdInput.placeholder = "Leave blank to keep current";

    document.getElementById('userModalTitle').innerText = 'Edit User Profile';
    document.getElementById('saveUserBtn').innerText = 'Update User';

    const m = document.getElementById('userModal');
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.children[0].classList.remove('scale-95'); }, 10);
};

userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('saveUserBtn');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    btn.disabled = true;

    const id = document.getElementById('userId').value;
    const passwordInput = document.getElementById('userPassword').value;

    const userData = {
        name: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value,
        role: document.getElementById('userRole').value,
        is_active: true
    };

    if (passwordInput) userData.password_hash = passwordInput;

    try {
        if (id) {
            const { error } = await supabase.from(DB_TABLES.USERS).update(userData).eq('id', id);
            if (error) throw error;
            
            window.showToast('User updated successfully!', 'success');
            await logSystemAction('UPDATE', 'users', id, `Updated user details for ${userData.email}`);
        } else {
            const { data, error } = await supabase.from(DB_TABLES.USERS).insert([userData]).select().single();
            if (error) throw error;
            
            window.showToast('User created successfully!', 'success');
            await logSystemAction('CREATE', 'users', data.id, `Created new user ${userData.email} with role ${userData.role}`);
        }
        
        window.closeDetailsModal('userModal');
        await window.loadUsersData(); 
    } catch (error) {
        window.showToast("Operation Failed: " + error.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

window.deleteUser = async function(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    // 🛡️ حماية إضافية للحذف
    if (user.role === 'admin' && user.id !== currentAdminId) {
        window.showToast("Unauthorized: Cannot delete other administrators.", "error");
        return;
    }
    
    if (user.id === currentAdminId) {
        window.showToast("You cannot delete your own active session.", "error");
        return;
    }

    if(confirm("DANGER: Are you sure you want to permanently delete this user?")) {
        const { error } = await supabase.from(DB_TABLES.USERS).delete().eq('id', id);
        if(error) {
            window.showToast("Deletion Failed: " + error.message, "error");
        } else {
            window.showToast("User deleted successfully!", "success");
            await logSystemAction('DELETE', 'users', id, `Deleted user account: ${user.email}`);
            window.loadUsersData();
        }
    }
};
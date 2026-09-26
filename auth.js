// ============================================================================
// تسجيل الدخول / إنشاء حساب / حالة المستخدم الحالي
// ============================================================================
let currentUser = null;       // Firebase auth user object
let currentUserProfile = null; // { name, email, role: 'makhdoum' | 'khadem' }

// الإيميلات المسموح لها تختار "خادم" وقت التسجيل. لازم تفضل نفس القائمة
// الموجودة في firestore.rules (isServant) عشان الاتنين يتزامنوا.
const SERVANT_EMAILS = [
    'rafat.kireloss@gmail.com',
    'minartk@gmail.com',
    'nermingamil167@gmail.com',
    'rashagamil83@gmail.com'
];

const AUTH_ERROR_MESSAGES = {
    'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
    'auth/user-disabled': 'تم تعطيل هذا الحساب.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/wrong-password': 'كلمة السر غير صحيحة.',
    'auth/invalid-credential': 'البريد الإلكتروني أو كلمة السر غير صحيحة.',
    'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم بالفعل.',
    'auth/weak-password': 'كلمة السر ضعيفة جدًا (٦ أحرف على الأقل).',
    'auth/missing-password': 'من فضلك أدخل كلمة السر.',
    'auth/network-request-failed': 'تعذر الاتصال بالإنترنت.'
};

function authErrorMessage(err) {
    return AUTH_ERROR_MESSAGES[err.code] || 'حدث خطأ ما، حاول مرة أخرى.';
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.style.display = msg ? 'block' : 'none';
}

function switchAuthTab(tab) {
    showAuthError('');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('login-form').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('signup-form').style.display = tab === 'signup' ? 'flex' : 'none';
}

function isServantEmail(email) {
    return SERVANT_EMAILS.includes((email || '').toLowerCase().trim());
}

function setupPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            btn.classList.toggle('is-showing', willShow);
            btn.setAttribute('aria-label', willShow ? 'إخفاء كلمة السر' : 'إظهار كلمة السر');
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tab-login').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('tab-signup').addEventListener('click', () => switchAuthTab('signup'));
    setupPasswordToggles();

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showAuthError('');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            showAuthError(authErrorMessage(err));
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showAuthError('');
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const roleChoice = document.querySelector('input[name="signup-role"]:checked');
        const requestedRole = roleChoice ? roleChoice.value : 'makhdoum'; // 'makhdoum' | 'khadem'

        if (!name) { showAuthError('من فضلك أدخل اسمك.'); return; }

        if (requestedRole === 'khadem' && !isServantEmail(email)) {
            showAuthError('هذا البريد الإلكتروني غير مسموح له بالتسجيل كخادم.');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(cred.user.uid).set({
                name,
                email,
                role: requestedRole, // enforced again server-side in firestore.rules
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            showAuthError(authErrorMessage(err));
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            currentUserProfile = doc.exists ? doc.data() : { name: user.email, email: user.email, role: 'makhdoum' };
        } catch (err) {
            console.error('تعذر تحميل بيانات الحساب', err);
            currentUserProfile = { name: user.email, email: user.email, role: 'makhdoum' };
        }

        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-root').style.display = '';
        document.getElementById('current-user-name').innerText = `مرحباً، ${currentUserProfile.name || user.email}`;
        document.getElementById('admin-entry-btn').style.display =
            currentUserProfile.role === 'khadem' ? 'inline-block' : 'none';

        window.dispatchEvent(new CustomEvent('app:ready'));
    } else {
        currentUser = null;
        currentUserProfile = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-root').style.display = 'none';
        showAuthError('');
    }
});

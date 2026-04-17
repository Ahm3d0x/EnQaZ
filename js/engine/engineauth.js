// ============================================================================
// 🛡️ EnQaZ Core Engine - Isolated Authentication Logic
// ============================================================================

const ENGINE_SECRET_KEY = "0xENQAZ_CORE";

document.addEventListener('DOMContentLoaded', () => {
    // If somehow already valid, kick them straight to engine without logic
    const session = localStorage.getItem("ENGINE_SESSION");
    if (session && session.length > 10) {
        window.location.replace('engine.html');
        return;
    }

    const loginForm = document.getElementById('engine-login-form');
    const keyInput = document.getElementById('engine-key-input');
    const alertBox = document.getElementById('auth-alert');
    const btnSubmit = document.getElementById('btn-submit');

    if (!loginForm) return;

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        btnSubmit.innerText = "VERIFYING...";
        alertBox.classList.add('hidden');

        // Fast resolution delay mapping reality logic
        setTimeout(() => {
            const val = keyInput.value.trim();
            if (val === ENGINE_SECRET_KEY) {
                // Generate a random Session UUID equivalent string for DB indexing 
                const newSessionId = crypto.randomUUID();
                localStorage.setItem("ENGINE_SESSION", newSessionId);
                
                btnSubmit.innerText = "ACCESS GRANTED";
                btnSubmit.classList.add('border-term-dim', 'text-term-dim');
                btnSubmit.classList.remove('border-term-text', 'text-term-text');
                
                // Route to engine directly! DB logic is intercepted there natively.
                setTimeout(() => window.location.replace('engine.html'), 500);
            } else {
                // Invalid Key
                btnSubmit.innerText = "Execute Boot Sequence";
                alertBox.innerText = "ACCESS DENIED";
                alertBox.classList.remove('hidden');
                keyInput.value = '';
            }
        }, 600);
    });
});

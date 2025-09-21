export function tabs() {
    document.querySelectorAll('.tabBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}
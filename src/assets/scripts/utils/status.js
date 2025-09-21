export function setStatus(text, isError = false) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;

    statusEl.textContent = text;
    statusEl.style.color = isError ? '#b00020' : '#6eff00';

    setTimeout(() => {
        statusEl.textContent = '';
    }, 2000);
}

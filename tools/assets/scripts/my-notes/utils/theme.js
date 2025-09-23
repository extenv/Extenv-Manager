const modeBtn = document.getElementById("modeBtn");

export function theme() {
    // Load saved theme on page load
    chrome.storage.local.get(['theme'], function (result) {
        if (result.theme === 'dark') {
            document.body.classList.add('dark');
            modeBtn.textContent = '☀️';
        } else {
            document.body.classList.remove('dark');
            modeBtn.textContent = '🌙';
        }
    });

    // Toggle theme on button click
    modeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        modeBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
        chrome.storage.local.set({ theme: document.body.classList.contains("dark") ? "dark" : "light" });
    });
}
export function tabs() {
    const tabButtons = document.querySelectorAll('.tabBtn');
    const sections = document.querySelectorAll('section');

    chrome.storage.local.get('activeTab', (data) => {
        const savedTab = data.activeTab;
        if (savedTab) {
            tabButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            const btn = document.querySelector(`.tabBtn[data-tab="${savedTab}"]`);
            const section = document.getElementById(savedTab);
            if (btn && section) {
                btn.classList.add('active');
                section.classList.add('active');
            }
        }
    });

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            chrome.storage.local.set({ activeTab: btn.dataset.tab });
        });
    });
}

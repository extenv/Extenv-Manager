const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleBtn");

export function sidebarToggle() {
    chrome.storage.local.get("sidebarClosed", (result) => {
        if (result.sidebarClosed) {
            sidebar.classList.add("closed");
        } else {
            sidebar.classList.remove("closed");
        }
    });

    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("closed");
        chrome.storage.local.set({
            sidebarClosed: sidebar.classList.contains("closed")
        });
    });
}

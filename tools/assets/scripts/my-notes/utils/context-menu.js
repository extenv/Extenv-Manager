const contextMenu = document.getElementById("contextMenu");

export function contextMenu() {
    document.body.addEventListener("click", () => {
        contextMenu.style.display = "none";
    });
}
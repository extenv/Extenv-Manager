const searchInput = document.getElementById("tool-search");
const toolList = document.getElementById("tool-list");
import { tools } from "../utils/tool-list.js";

tools.forEach(tool => {
    const li = document.createElement("li");
    li.textContent = tool.name;
    li.dataset.url = tool.url;
    toolList.appendChild(li);
});

export function ToolItems() {
    toolList.querySelectorAll("li").forEach(item => {
        if (!item.dataset.bound) {
            item.addEventListener("click", () => {
                const url = item.dataset.url;
                if (url.startsWith("chrome://")) {
                    chrome.tabs.create({ url });
                } else {
                    chrome.tabs.create({ url: chrome.runtime.getURL(url + ".html") });
                }
            });
            item.dataset.bound = "true";
        }
    });
}

searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    toolList.querySelectorAll("li").forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(query) ? "block" : "none";
    });
});

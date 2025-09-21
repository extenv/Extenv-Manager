const treeEl = document.getElementById('tree');

// import
import { applySettings } from '../logic/settings.js';
import { getExpandedIds, toggleExpanded } from '../utils/accordion.js';
import { setStatus } from '../utils/status.js';
import { dummyNodes } from '../utils/mock.js';

const menu = document.createElement('div');
menu.className = "contextMenu";
menu.style.position = "absolute";
menu.style.display = "none";
menu.style.flexDirection = "column";
menu.style.background = "#fff";
menu.style.border = "1px solid #ccc";
menu.style.padding = "4px";
menu.innerHTML = `
    <button class="rename">✏️ Rename</button>
    <button class="editUrl">🌐 Edit URL</button>
    <button class="delete">🗑️ Delete</button>
    <button class="newFolder">➕ New Folder</button>
`;
document.body.appendChild(menu);

let currentNode = null;
let currentLi = null;

document.addEventListener('click', () => menu.style.display = "none");

menu.querySelector('.newFolder').addEventListener('click', async () => {
    if (!currentNode) return;
    let folderName = prompt("New folder name:");
    if (!folderName) return;

    const children = await new Promise((res, rej) => {
        chrome.bookmarks.getChildren(currentNode.id, nodes => {
            if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
            res(nodes);
        });
    });

    const existingTitles = children.map(c => c.title);
    let uniqueName = folderName;
    let counter = 2;
    while (existingTitles.includes(uniqueName)) {
        uniqueName = `${folderName} (${counter})`;
        counter++;
    }

    chrome.bookmarks.create({
        parentId: currentNode.id,
        title: uniqueName
    }, () => {
        setStatus("New folder has been created");
        loadBookmarks();
    });

    menu.style.display = "none";
});


menu.querySelector('.rename').onclick = async () => {
    if (!currentNode) return;
    let newTitle = prompt("New Title:", currentNode.title);
    if (!newTitle) return;

    const parentId = currentNode.parentId;
    const siblings = await new Promise((res, rej) => {
        chrome.bookmarks.getChildren(parentId, nodes => {
            if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
            res(nodes.filter(n => n.id !== currentNode.id));
        });
    });

    const existingTitles = siblings.map(s => s.title);
    let uniqueTitle = newTitle;
    let counter = 2;
    while (existingTitles.includes(uniqueTitle)) {
        uniqueTitle = `${newTitle} (${counter})`;
        counter++;
    }

    await chrome.bookmarks.update(currentNode.id, { title: uniqueTitle });
    setStatus("Title changes");
    if (currentNode.url) {
        currentLi.querySelector("a").textContent = uniqueTitle;
    } else {
        currentLi.querySelector("span.folder").textContent = "📂 " + uniqueTitle;
    }

    menu.style.display = "none";
};


menu.querySelector('.editUrl').onclick = async () => {
    if (!currentNode || !currentNode.url) return;
    const newUrl = prompt("New URL :", currentNode.url);
    if (newUrl) {
        await chrome.bookmarks.update(currentNode.id, { url: newUrl });
        setStatus("URL changes!");
    }
    menu.style.display = "none";
};

menu.querySelector('.delete').onclick = async () => {
    if (!currentNode) return;
    try {
        await deleteBookmark(currentNode.id);
        currentLi.remove();
        setStatus("Bookmark has been deleted");
    } catch (err) {
        setStatus("Failed to delete: " + err.message, true);
    }
    menu.style.display = "none";
};


async function renderNodes(nodes, expandedIds = []) {
    const ul = document.createElement('ul');

    for (const node of nodes) {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = "row";

        // --- DRAG & DROP ---
        row.draggable = true;
        row.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", node.id);
            e.stopPropagation();
            const crt = document.createElement("div");
            e.dataTransfer.setDragImage(crt, 0, 0);
        });
        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            const parentUl = li.parentElement;
            const items = [...parentUl.children];
            const dropIndex = items.indexOf(li);

            const rect = li.getBoundingClientRect();
            const offset = e.clientY - rect.top;
            if (offset < rect.height / 2) {
                li.classList.add("drag-over-top");
                li.classList.remove("drag-over-bottom");
            } else {
                li.classList.add("drag-over-bottom");
                li.classList.remove("drag-over-top");
            }
        });

        row.addEventListener("dragleave", () => {
            li.classList.remove("drag-over-top", "drag-over-bottom");
        });

        row.addEventListener("drop", async (e) => {
            e.preventDefault();
            li.classList.remove("drag-over-top", "drag-over-bottom");

            const draggedId = e.dataTransfer.getData("text/plain");
            if (!draggedId || draggedId === node.id) return;

            try {
                await new Promise((res, rej) => {
                    const parentUl = li.parentElement;
                    const items = [...parentUl.children];
                    let dropIndex = items.indexOf(li);

                    const rect = li.getBoundingClientRect();
                    const offset = e.clientY - rect.top;
                    if (offset >= rect.height / 2) dropIndex++;

                    chrome.bookmarks.move(draggedId, {
                        parentId: node.url ? node.parentId : node.id,
                        index: dropIndex
                    }, (moved) => {
                        if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
                        res(moved);
                    });
                });
                setStatus("Bookmark has been moved");
                loadBookmarks();
            } catch (err) {
                setStatus("Failed to move: " + err.message, true);
            }
        });




        // --- END DRAG & DROP ---

        if (node.url) {
            const img = document.createElement("img");
            img.className = "favicon";

            const urlObj = new URL(node.url);
            img.src = "https://www.google.com/s2/favicons?domain=" + urlObj.hostname;

            img.onerror = () => (img.src = "assets/images/icon.png");
            row.appendChild(img);

            const a = document.createElement('a');
            a.textContent = node.title || node.url;
            a.href = "#";
            a.addEventListener('click', e => {
                e.preventDefault();
                if (typeof chrome !== "undefined" && chrome.tabs?.create) {
                    chrome.tabs.create({ url: node.url });
                } else {
                    window.open(node.url, "_blank");
                }
            });

            row.appendChild(a);
        } else {
            const span = document.createElement('span');
            span.className = 'folder';

            // set icon
            span.textContent = (expandedIds.includes(node.id) ? "📂⤵️ " : "📁 ") + (node.title || 'Folder');

            span.addEventListener('click', async () => {
                li.classList.toggle('open');
                await toggleExpanded(node.id);

                // change icon when user click
                if (li.classList.contains('open')) {
                    span.textContent = "📂⤵️ " + (node.title || 'Folder');
                } else {
                    span.textContent = "📁 " + (node.title || 'Folder');
                }
            });

            row.appendChild(span);

        }

        // --- CONTEXT MENU HANDLER ---
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            currentNode = node;
            currentLi = li;

            menu.style.display = "none";
            menu.style.top = e.pageY + "px";
            menu.style.left = e.pageX + "px";

            const rootIds = ["1", "2"];
            const trashFolderTitle = "Trash";
            const isRootOrTrash = rootIds.includes(node.id) || node.title === trashFolderTitle;

            menu.querySelector('.rename').style.display = isRootOrTrash ? 'none' : 'block';
            menu.querySelector('.editUrl').style.display = (node.url && !isRootOrTrash) ? 'block' : 'none';
            menu.querySelector('.delete').style.display = isRootOrTrash ? 'none' : 'block';
            menu.querySelector('.newFolder').style.display = node.url ? 'none' : 'block';

            menu.style.display = "flex";
        });


        li.appendChild(row);

        if (node.children && node.children.length) {
            const childUL = await renderNodes(node.children, expandedIds);
            li.appendChild(childUL);
            if (expandedIds.includes(node.id)) li.classList.add('open');
        }

        ul.appendChild(li);
    }

    return ul;
}

async function deleteBookmark(id) {
    return new Promise((res, rej) => {
        chrome.bookmarks.removeTree(id, () => {
            if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
            res();
        });
    });
}

function bookmarksGetTree() {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getTree(nodes => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(nodes);
        });
    });
}

export async function loadBookmarks() {
    treeEl.textContent = 'Load bookmark...';
    try {
        const nodes = await bookmarksGetTree();
        const topNodes = nodes[0].children || [];
        const expandedIds = await getExpandedIds();
        treeEl.innerHTML = "";
        const tree = await renderNodes(topNodes, expandedIds);

        treeEl.appendChild(tree);

        // --- apply saved settings (color, font size, font family) ---
        await applySettings();
    } catch (err) {
        treeEl.textContent = 'Failed to load bookmark. Showing dummy data...';
        setStatus(err.message || String(err), true);
        const expandedIds = await getExpandedIds();
        treeEl.innerHTML = "";
        const tree = await renderNodes(dummyNodes, expandedIds);
        treeEl.appendChild(tree);

        await applySettings();
    }
}

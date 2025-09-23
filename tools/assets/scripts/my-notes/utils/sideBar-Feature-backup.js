const notesList = document.getElementById("notesList");
const contextMenu = document.getElementById("contextMenu");
const addNoteBtn = document.getElementById("addNote");
const addFolderBtn = document.getElementById("addFolder");
const searchNotes = document.getElementById("searchNotes");

let dragSource = null;
let selectedItem = null;
let renameInput = null;
let currentRenameItem = null;

export function sideBar() {
    chrome.storage.local.get(["notes", "folderStates"], (result) => {
        notesList.innerHTML = "";
        let notes = result.notes || [];
        const folderStates = result.folderStates || {};

        if (notes.length === 0) {
            const defaultNote = {
                id: Date.now().toString(),
                title: "Untitled",
                content: "",
                type: "note"
            };
            notes = [defaultNote];
            chrome.storage.local.set({ notes, folderStates: {} });
        }

        renderNotes(notes, folderStates);
        setupDragAndDrop();
        setupFolderToggle();
        setupContextMenu();
    });
}

function renderNotes(notes, folderStates, parentUl = notesList, level = 0, isLastItems = []) {
    notes.forEach((item, index) => {
        const isLast = index === notes.length - 1;
        const li = document.createElement("li");
        li.style.position = 'relative';
        li.style.minHeight = '24px';

        const contentDiv = document.createElement("div");
        contentDiv.className = "item-content";
        contentDiv.style.display = "flex";
        contentDiv.style.alignItems = "center";
        contentDiv.style.height = '100%';
        contentDiv.style.position = 'relative';

        // Tree lines container - absolute positioned for continuous lines
        const linesContainer = document.createElement("div");
        linesContainer.className = "tree-lines-container";
        linesContainer.style.position = 'absolute';
        linesContainer.style.left = '0';
        linesContainer.style.top = '0';
        linesContainer.style.bottom = '0';
        linesContainer.style.display = 'flex';

        // Add vertical lines for each level
        for (let i = 0; i < level; i++) {
            const line = document.createElement("div");
            line.className = "tree-vertical-line";
            line.style.width = '16px';
            line.style.height = '100%';
            line.style.borderLeft = isLastItems[i] ? 'none' : '1px solid #ccc';
            line.style.marginRight = '0';
            linesContainer.appendChild(line);
        }

        // Horizontal connector line for current item
        if (level > 0) {
            const horizontalLine = document.createElement("div");
            horizontalLine.className = "tree-horizontal-line";
            horizontalLine.style.width = '16px';
            horizontalLine.style.height = '1px';
            horizontalLine.style.borderTop = '1px solid #ccc';
            horizontalLine.style.position = 'absolute';
            horizontalLine.style.left = (level * 16) + 'px';
            horizontalLine.style.top = '50%';
            horizontalLine.style.transform = 'translateY(-50%)';
            contentDiv.appendChild(horizontalLine);
        }

        // Icon with proper spacing
        const iconSpan = document.createElement("span");
        iconSpan.className = "item-icon";
        iconSpan.style.marginLeft = (level * 16) + 'px';
        iconSpan.style.marginRight = '6px';
        iconSpan.style.flexShrink = '0';
        iconSpan.textContent = item.type === "folder" ? "📁" : "📝";

        const textSpan = document.createElement("span");
        textSpan.className = "item-text";
        textSpan.textContent = item.title || "Untitled";
        textSpan.style.flex = '1';
        textSpan.style.minWidth = '0';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';

        contentDiv.appendChild(linesContainer);
        contentDiv.appendChild(iconSpan);
        contentDiv.appendChild(textSpan);

        li.appendChild(contentDiv);

        li.dataset.id = item.id;
        li.dataset.type = item.type;
        li.draggable = true;

        if (item.type === "folder") {
            li.classList.add("folder");
            const childUl = document.createElement("ul");
            childUl.classList.add("folder-content");
            childUl.style.marginLeft = '0';
            childUl.style.paddingLeft = '0';
            childUl.style.position = 'relative';

            const isExpanded = folderStates[item.id] || false;
            childUl.style.display = isExpanded ? "block" : "none";
            iconSpan.textContent = isExpanded ? "📂" : "📁";

            li.appendChild(childUl);

            if (item.children && item.children.length > 0) {
                renderNotes(item.children, folderStates, childUl, level + 1, [...isLastItems, isLast]);
            }
        } else {
            li.classList.add("note");
        }

        parentUl.appendChild(li);
    });
}

function setupFolderToggle() {
    notesList.addEventListener("click", (e) => {
        if (renameInput) return;

        const target = e.target;
        const li = target.closest("li");

        if (li && li.classList.contains("folder")) {
            const icon = li.querySelector(".item-icon");
            const childUl = li.querySelector(".folder-content");
            const folderId = li.dataset.id;

            if (childUl) {
                chrome.storage.local.get(["folderStates"], (result) => {
                    const folderStates = result.folderStates || {};
                    const isExpanded = folderStates[folderId] || false;

                    const newState = !isExpanded;
                    folderStates[folderId] = newState;

                    if (newState) {
                        childUl.style.display = "block";
                        icon.textContent = "📂";
                    } else {
                        childUl.style.display = "none";
                        icon.textContent = "📁";
                    }

                    chrome.storage.local.set({ folderStates });
                });
            }
            e.stopPropagation();
        }
    });
}

function setupContextMenu() {
    notesList.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const li = e.target.closest("li");
        if (li) {
            selectedItem = li;
            contextMenu.style.display = "block";
            contextMenu.style.left = e.pageX + "px";
            contextMenu.style.top = e.pageY + "px";
        } else {
            selectedItem = null;
            contextMenu.style.display = "block";
            contextMenu.style.left = e.pageX + "px";
            contextMenu.style.top = e.pageY + "px";
        }
    });

    document.addEventListener("click", (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = "none";
        }
    });

    contextMenu.addEventListener("click", (e) => {
        const menuItem = e.target.closest("li");
        if (menuItem) {
            const action = menuItem.id;
            handleContextMenuAction(action, selectedItem);
        }
        contextMenu.style.display = "none";
    });
}

function startRename(itemElement) {
    // Cancel previous rename if any
    if (renameInput && currentRenameItem) {
        const textSpan = currentRenameItem.querySelector('.item-text');
        if (textSpan) {
            textSpan.style.display = 'block';
        }
        if (renameInput.parentNode && document.body.contains(renameInput)) {
            renameInput.parentNode.removeChild(renameInput);
        }
        renameInput = null;
        currentRenameItem = null;
    }

    const textSpan = itemElement.querySelector('.item-text');
    const currentName = textSpan.textContent;
    currentRenameItem = itemElement;

    renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = currentName;
    renameInput.style.flex = '1';
    renameInput.style.border = '1px solid #007bff';
    renameInput.style.padding = '2px 4px';
    renameInput.style.borderRadius = '2px';
    renameInput.style.margin = '0';
    renameInput.style.font = 'inherit';
    renameInput.style.background = 'white';
    renameInput.style.width = '100%';

    const contentDiv = itemElement.querySelector('.item-content');

    textSpan.style.display = 'none';
    contentDiv.appendChild(renameInput);

    // Use setTimeout to ensure the input is properly in the DOM before focusing
    setTimeout(() => {
        renameInput.focus();
        renameInput.select();
    }, 10);

    let blurTimeout = null;

    const finishRename = () => {
        if (blurTimeout) {
            clearTimeout(blurTimeout);
            blurTimeout = null;
        }

        if (!renameInput || !currentRenameItem) return;

        const newName = renameInput.value.trim() || currentName;
        const itemId = currentRenameItem.dataset.id;

        textSpan.textContent = newName;
        textSpan.style.display = 'block';

        if (renameInput.parentNode && document.body.contains(renameInput)) {
            renameInput.parentNode.removeChild(renameInput);
        }

        renameInput = null;
        currentRenameItem = null;

        renameItem(itemId, newName);
    };

    const handleBlur = () => {
        // Add a small delay to allow for click events to be processed
        blurTimeout = setTimeout(finishRename, 200);
    };

    const handleClick = (e) => {
        e.stopPropagation();
        // Prevent blur from firing when clicking on the input itself
        if (blurTimeout) {
            clearTimeout(blurTimeout);
            blurTimeout = null;
        }
    };

    renameInput.addEventListener('blur', handleBlur);
    renameInput.addEventListener('click', handleClick);
    renameInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (blurTimeout) {
                clearTimeout(blurTimeout);
                blurTimeout = null;
            }
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (blurTimeout) {
                clearTimeout(blurTimeout);
                blurTimeout = null;
            }

            textSpan.style.display = 'block';

            if (renameInput.parentNode && document.body.contains(renameInput)) {
                renameInput.parentNode.removeChild(renameInput);
            }

            renameInput = null;
            currentRenameItem = null;
        }
    });


}

// Also update the context menu handler to prevent event propagation
function handleContextMenuAction(action, itemElement) {
    switch (action) {
        case "newFolder":
            createNewFolder(itemElement);
            break;
        case "newNote":
            createNewNote(itemElement);
            break;
        case "renameNote":
            if (itemElement) {
                // Prevent the context menu click from interfering
                setTimeout(() => {
                    startRename(itemElement);
                }, 10);
            }
            break;
        case "deleteNote":
            if (itemElement) {
                const folderId = itemElement.dataset.id;
                removeFolderState(folderId);
                deleteItem(itemElement.dataset.id);
            }
            break;
    }
}

function renameItem(itemId, newName) {
    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || [];
        const item = findItemById(notes, itemId);
        if (item) {
            item.title = newName;
            chrome.storage.local.set({ notes }, () => {
                sideBar();
            });
        }
    });
}

function removeFolderState(folderId) {
    chrome.storage.local.get(["folderStates"], (result) => {
        const folderStates = result.folderStates || {};
        delete folderStates[folderId];
        chrome.storage.local.set({ folderStates });
    });
}

function createNewFolder(parentElement) {
    chrome.storage.local.get(["notes", "folderStates"], (result) => {
        const notes = result.notes || [];
        const folderStates = result.folderStates || {};
        const folderName = generateUniqueName(notes, "New Folder", parentElement);
        const newFolder = {
            id: Date.now().toString(),
            title: folderName,
            type: "folder",
            children: []
        };

        folderStates[newFolder.id] = false;

        if (parentElement && parentElement.dataset.type === "folder") {
            const parentId = parentElement.dataset.id;
            const parentFolder = findItemById(notes, parentId);
            if (parentFolder) {
                if (!parentFolder.children) parentFolder.children = [];
                parentFolder.children.unshift(newFolder);
            }
        } else {
            notes.unshift(newFolder);
        }

        chrome.storage.local.set({ notes, folderStates }, () => {
            sideBar();
        });
    });
}

function createNewNote(parentElement) {
    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || [];
        const noteName = generateUniqueName(notes, "Untitled", parentElement);
        const newNote = {
            id: Date.now().toString(),
            title: noteName,
            content: "",
            type: "note"
        };

        if (parentElement && parentElement.dataset.type === "folder") {
            const parentId = parentElement.dataset.id;
            const parentFolder = findItemById(notes, parentId);
            if (parentFolder) {
                if (!parentFolder.children) parentFolder.children = [];
                parentFolder.children.unshift(newNote);
            }
        } else {
            notes.unshift(newNote);
        }

        chrome.storage.local.set({ notes }, () => {
            sideBar();
        });
    });
}

function generateUniqueName(notes, baseName, parentElement) {
    let allNames = new Set();

    function collectNames(items) {
        items.forEach(item => {
            allNames.add(item.title);
            if (item.children) {
                collectNames(item.children);
            }
        });
    }

    if (parentElement && parentElement.dataset.type === "folder") {
        const parentId = parentElement.dataset.id;
        const parentFolder = findItemById(notes, parentId);
        if (parentFolder && parentFolder.children) {
            collectNames(parentFolder.children);
        }
    } else {
        collectNames(notes);
    }

    let name = baseName;
    let counter = 2;

    while (allNames.has(name)) {
        name = `${baseName} (${counter})`;
        counter++;
    }

    return name;
}

function deleteItem(itemId) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '10000';

    const dialog = document.createElement('div');
    dialog.style.background = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '8px';
    dialog.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    dialog.innerHTML = `
        <p>Are you sure you want to delete this item?</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
            <button id="cancelDelete" style="padding: 5px 15px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="confirmDelete" style="padding: 5px 15px; border: 1px solid #dc3545; background: #dc3545; color: white; border-radius: 4px; cursor: pointer;">Delete</button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    document.getElementById('cancelDelete').onclick = () => {
        document.body.removeChild(modal);
    };

    document.getElementById('confirmDelete').onclick = () => {
        chrome.storage.local.get(["notes"], (result) => {
            const notes = result.notes || [];
            const updatedNotes = removeItemById(notes, itemId);
            chrome.storage.local.set({ notes: updatedNotes }, () => {
                document.body.removeChild(modal);
                sideBar();
            });
        });
    };
}

function removeItemById(items, id) {
    return items.filter(item => {
        if (item.id === id) {
            return false;
        }
        if (item.children && item.children.length > 0) {
            item.children = removeItemById(item.children, id);
        }
        return true;
    });
}

function setupDragAndDrop() {
    notesList.addEventListener("dragstart", (e) => {
        if (e.target.tagName === "LI" || e.target.closest("li")) {
            const li = e.target.tagName === "LI" ? e.target : e.target.closest("li");
            dragSource = li;
            li.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", li.dataset.id);
        }
    });

    notesList.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!dragSource) return;

        const targetLi = e.target.closest("li");
        if (!targetLi) return;

        const rect = targetLi.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        targetLi.classList.remove("drop-above", "drop-below", "drop-inside");

        if (targetLi.dataset.type === "folder" && e.clientY > midpoint - 10 && e.clientY < midpoint + 10) {
            targetLi.classList.add("drop-inside");
        } else if (e.clientY < midpoint) {
            targetLi.classList.add("drop-above");
        } else {
            targetLi.classList.add("drop-below");
        }
    });

    notesList.addEventListener("dragleave", (e) => {
        const targetLi = e.target.closest("li");
        if (targetLi) {
            targetLi.classList.remove("drop-above", "drop-below", "drop-inside");
        }
    });

    notesList.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragSource) return;

        const targetLi = e.target.closest("li");
        if (!targetLi || targetLi === dragSource) return;

        const sourceId = dragSource.dataset.id;
        const targetId = targetLi.dataset.id;

        chrome.storage.local.get(["notes", "folderStates"], (result) => {
            let notes = result.notes || [];
            const folderStates = result.folderStates || {};
            const updatedNotes = moveItemInStructure(notes, sourceId, targetId, getDropPosition(targetLi));

            if (updatedNotes) {
                chrome.storage.local.set({ notes: updatedNotes, folderStates }, () => {
                    sideBar();
                });
            }
        });

        dragSource.classList.remove("dragging");
        dragSource = null;
    });

    notesList.addEventListener("dragend", () => {
        if (dragSource) {
            dragSource.classList.remove("dragging");
            dragSource = null;
        }
    });
}

function getDropPosition(targetLi) {
    if (targetLi.classList.contains("drop-inside")) return "inside";
    if (targetLi.classList.contains("drop-above")) return "above";
    return "below";
}

function moveItemInStructure(notes, sourceId, targetId, position) {
    let sourceItem = null;

    function findAndRemoveSource(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === sourceId) {
                sourceItem = JSON.parse(JSON.stringify(items[i]));
                items.splice(i, 1);
                return true;
            }
            if (items[i].children && items[i].children.length > 0) {
                if (findAndRemoveSource(items[i].children)) {
                    return true;
                }
            }
        }
        return false;
    }

    function insertItem(items, item, targetId, position) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === targetId) {
                if (position === "inside" && items[i].type === "folder") {
                    if (!items[i].children) items[i].children = [];
                    items[i].children.unshift(item);
                } else if (position === "above") {
                    items.splice(i, 0, item);
                } else if (position === "below") {
                    items.splice(i + 1, 0, item);
                }
                return true;
            }
            if (items[i].children && items[i].children.length > 0) {
                if (insertItem(items[i].children, item, targetId, position)) {
                    return true;
                }
            }
        }
        return false;
    }

    const notesCopy = JSON.parse(JSON.stringify(notes));

    if (!findAndRemoveSource(notesCopy)) {
        return null;
    }

    if (position === "inside") {
        const targetFolder = findItemById(notesCopy, targetId);
        if (targetFolder && targetFolder.type === "folder") {
            if (!targetFolder.children) targetFolder.children = [];
            targetFolder.children.unshift(sourceItem);
            return notesCopy;
        }
    }

    if (!insertItem(notesCopy, sourceItem, targetId, position)) {
        return null;
    }

    return notesCopy;
}

function findItemById(items, id) {
    for (const item of items) {
        if (item.id === id) return item;
        if (item.children && item.children.length > 0) {
            const found = findItemById(item.children, id);
            if (found) return found;
        }
    }
    return null;
}
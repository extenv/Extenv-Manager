const notesList = document.getElementById("notesList");
const contextMenu = document.getElementById("contextMenu");
const mainHeader = document.querySelector(".MainHeader h3");
const searchItem = document.getElementById("searchNotes");

let dragSource = null;
let selectedItem = null;
let renameInput = null;
let currentRenameItem = null;
let currentNoteId = null;
let quill = null;
let isDeleting = false;

function initializeEditor() {
    Quill.register('modules/imageResize', QuillResizeModule);
    quill = new Quill('#editor', {
        theme: 'snow',
        modules: {
            imageResize: {
                displaySize: true
            },
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'direction': 'rtl' }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'font': [] }],
                [{ 'align': [] }],
                ['clean'],
                ['link', 'image', 'video']
            ]
        },
        placeholder: 'Start writing your note...',
        formats: [
            'header', 'font', 'size',
            'bold', 'italic', 'underline', 'strike', 'blockquote',
            'list', 'bullet', 'indent',
            'link', 'image', 'video'
        ]
    });

    quill.on('text-change', function () {
        saveNoteContent();
    });
}

function loadNoteContent(noteId) {
    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || [];
        const note = findItemById(notes, noteId);

        if (note && quill) {
            quill.root.innerHTML = note.content || "";
            currentNoteId = noteId;
            mainHeader.textContent = note.title || "My Notes";

            chrome.storage.local.set({ activeNoteId: noteId }, () => { });
        }
    });
}

function saveNoteContent() {
    if (!currentNoteId || !quill) return;

    const content = quill.root.innerHTML;

    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || [];
        const note = findItemById(notes, currentNoteId);

        if (note) {
            note.content = content;
            chrome.storage.local.set({ notes }, () => { });
        }
    });
}

export function sideBar() {
    chrome.storage.local.get(["notes", "folderStates", "activeNoteId"], (result) => {
        notesList.innerHTML = "";
        let notes = result.notes || [];
        const folderStates = result.folderStates || {};
        currentNoteId = result.activeNoteId || null;

        if (notes.length === 0) {
            const defaultNote = {
                id: Date.now().toString(),
                title: "Untitled",
                content: "",
                type: "note"
            };
            notes = [defaultNote];
            currentNoteId = defaultNote.id;
            chrome.storage.local.set({ notes, folderStates: {}, activeNoteId: currentNoteId });
        }

        const searchTerm = searchItem.value.trim().toLowerCase();

        if (searchTerm === '') {
            // Original logic for non-search mode
            const updatedFolderStates = autoExpandFoldersWithActiveNote(notes, folderStates, currentNoteId);
            renderNotes(notes, updatedFolderStates);
        } else {
            // Search mode
            const filteredNotes = filterNotes(notes, searchTerm);
            const searchFolderStates = getSearchFolderStates(notes, filteredNotes, folderStates, searchTerm);
            renderNotes(filteredNotes, searchFolderStates);
        }

        setupDragAndDrop();
        setupFolderToggle();
        setupContextMenu();
        setupNoteClickHandlers();

        if (currentNoteId && quill) {
            const note = findItemById(notes, currentNoteId);
            if (note) {
                quill.root.innerHTML = note.content || "";
                mainHeader.textContent = note.title || "My Notes";
            }
        }
    });
}

// New function to auto-expand folders containing active note
function autoExpandFoldersWithActiveNote(items, folderStates, activeNoteId, parentFolderIds = []) {
    const updatedFolderStates = { ...folderStates };

    for (const item of items) {
        if (item.type === "folder" && item.children) {
            // Check if this folder or any of its children contains the active note
            const containsActiveNote = checkIfFolderContainsNote(item, activeNoteId);

            if (containsActiveNote) {
                // Expand this folder and all parent folders
                updatedFolderStates[item.id] = true;

                // Also expand all parent folders in the chain
                for (const parentId of parentFolderIds) {
                    updatedFolderStates[parentId] = true;
                }
            }

            // Recursively check children
            if (item.children.length > 0) {
                const newParentIds = [...parentFolderIds, item.id];
                Object.assign(updatedFolderStates, autoExpandFoldersWithActiveNote(item.children, updatedFolderStates, activeNoteId, newParentIds));
            }
        }
    }

    return updatedFolderStates;
}

// Helper function to check if a folder contains a specific note
function checkIfFolderContainsNote(folder, noteId) {
    if (!folder.children) return false;

    for (const item of folder.children) {
        if (item.id === noteId) return true;
        if (item.type === "folder") {
            if (checkIfFolderContainsNote(item, noteId)) return true;
        }
    }

    return false;
}

function setupNoteClickHandlers() {
    notesList.addEventListener("click", (e) => {
        if (renameInput) return;

        const target = e.target;
        const li = target.closest("li");

        if (li && li.classList.contains("note")) {
            const noteId = li.dataset.id;
            loadNoteContent(noteId);
            document.querySelectorAll('.note').forEach(note => {
                note.classList.remove('active');
            });
            li.classList.add('active');

            chrome.storage.local.set({ activeNoteId: noteId }, () => { });
        }
    });
}

// Add search functionality
function setupSearch() {
    searchItem.addEventListener("input", debounce(handleSearch, 300));
    searchItem.addEventListener("keydown", (e) => {
        if (e.key === 'Escape') {
            searchItem.value = '';
            handleSearch();
            searchItem.blur();
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleSearch() {
    const searchTerm = searchItem.value.trim().toLowerCase();

    chrome.storage.local.get(["notes", "folderStates", "activeNoteId"], (result) => {
        const notes = result.notes || [];
        const folderStates = result.folderStates || {};
        currentNoteId = result.activeNoteId || null;

        if (searchTerm === '') {
            // If search is empty, show all notes with original folder states
            renderNotes(notes, folderStates);
        } else {
            // Filter notes and folders based on search term
            const filteredNotes = filterNotes(notes, searchTerm);
            const searchFolderStates = getSearchFolderStates(notes, filteredNotes, folderStates, searchTerm);
            renderNotes(filteredNotes, searchFolderStates);
        }

        setupDragAndDrop();
        setupFolderToggle();
        setupContextMenu();
        setupNoteClickHandlers();
    });
}

function filterNotes(items, searchTerm) {
    return items.filter(item => {
        const matches = item.title.toLowerCase().includes(searchTerm);

        if (item.type === "folder" && item.children) {
            // Filter children recursively
            const filteredChildren = filterNotes(item.children, searchTerm);

            // Keep folder if it matches search or has matching children
            if (matches || filteredChildren.length > 0) {
                const folderCopy = { ...item, children: filteredChildren };
                return folderCopy;
            }
            return false;
        }

        return matches;
    });
}

function getSearchFolderStates(allItems, filteredItems, originalFolderStates, searchTerm) {
    const searchFolderStates = { ...originalFolderStates };

    // Auto-expand all folders that contain search results
    function expandMatchingFolders(items, parentFolderIds = []) {
        for (const item of items) {
            if (item.type === "folder" && item.children) {
                const containsMatch = checkIfFolderContainsSearch(item, searchTerm);

                if (containsMatch) {
                    // Expand this folder and all parent folders
                    searchFolderStates[item.id] = true;

                    // Also expand all parent folders in the chain
                    for (const parentId of parentFolderIds) {
                        searchFolderStates[parentId] = true;
                    }
                }

                // Recursively check children
                if (item.children.length > 0) {
                    const newParentIds = [...parentFolderIds, item.id];
                    expandMatchingFolders(item.children, newParentIds);
                }
            }
        }
    }

    expandMatchingFolders(allItems);
    return searchFolderStates;
}

function checkIfFolderContainsSearch(folder, searchTerm) {
    if (!folder.children) return false;

    if (folder.title.toLowerCase().includes(searchTerm)) {
        return true;
    }

    for (const item of folder.children) {
        if (item.title.toLowerCase().includes(searchTerm)) {
            return true;
        }
        if (item.type === "folder") {
            if (checkIfFolderContainsSearch(item, searchTerm)) {
                return true;
            }
        }
    }

    return false;
}

// Update the renderNotes function to highlight search matches
function renderNotes(notes, folderStates, parentUl = notesList, level = 0, searchTerm = '') {
    parentUl.innerHTML = "";
    searchTerm = searchItem.value.trim().toLowerCase();

    notes.forEach((item, index) => {
        const li = document.createElement("li");
        li.style.position = 'relative';
        li.style.minHeight = '24px';

        const contentDiv = document.createElement("div");
        contentDiv.className = "item-content";
        contentDiv.style.display = "flex";
        contentDiv.style.alignItems = "center";
        contentDiv.style.height = '100%';
        contentDiv.style.cursor = 'pointer';
        contentDiv.style.padding = '2px 0';

        const iconSpan = document.createElement("span");
        iconSpan.className = "item-icon";
        iconSpan.style.marginLeft = (level * 16) + 'px';
        iconSpan.style.marginRight = '6px';
        iconSpan.style.flexShrink = '0';
        iconSpan.textContent = item.type === "folder" ? "📁" : "📝";

        const textSpan = document.createElement("span");
        textSpan.className = "item-text";
        textSpan.style.flex = '1';
        textSpan.style.minWidth = '0';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';

        // Highlight search matches
        if (searchTerm && searchTerm !== '') {
            const title = item.title || "Untitled";
            const lowerTitle = title.toLowerCase();
            const matchIndex = lowerTitle.indexOf(searchTerm);

            if (matchIndex !== -1) {
                const beforeMatch = title.substring(0, matchIndex);
                const match = title.substring(matchIndex, matchIndex + searchTerm.length);
                const afterMatch = title.substring(matchIndex + searchTerm.length);

                textSpan.innerHTML = `
                    ${escapeHtml(beforeMatch)}
                    <mark style="background-color: #ffeb3b; padding: 0; border-radius: 2px;">${escapeHtml(match)}</mark>
                    ${escapeHtml(afterMatch)}
                `;
            } else {
                textSpan.textContent = title;
            }
        } else {
            textSpan.textContent = item.title || "Untitled";
        }

        contentDiv.appendChild(iconSpan);
        contentDiv.appendChild(textSpan);
        li.appendChild(contentDiv);

        li.dataset.id = item.id;
        li.dataset.type = item.type;
        li.draggable = searchTerm === ''; // Disable drag & drop during search

        if (item.type === "folder") {
            li.classList.add("folder");
            const childUl = document.createElement("ul");
            childUl.classList.add("folder-content");
            childUl.style.marginLeft = '0';
            childUl.style.paddingLeft = '0';

            const isExpanded = folderStates[item.id] || false;
            childUl.style.display = isExpanded ? "block" : "none";
            iconSpan.textContent = isExpanded ? "📂" : "📁";

            li.appendChild(childUl);

            if (item.children && item.children.length > 0) {
                renderNotes(item.children, folderStates, childUl, level + 1, searchTerm);
            }
        } else {
            li.classList.add("note");
            if (item.id === currentNoteId) {
                li.classList.add('active');
            }
        }

        parentUl.appendChild(li);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ... rest of your existing functions remain the same ...

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

        chrome.storage.local.set({ notes, activeNoteId: newNote.id }, () => {
            sideBar();
            loadNoteContent(newNote.id);
        });
    });
}

function renameItem(itemId, newName) {
    chrome.storage.local.get(["notes"], (result) => {
        const notes = result.notes || [];
        const item = findItemById(notes, itemId);
        if (item) {
            item.title = newName;
            chrome.storage.local.set({ notes }, () => {
                sideBar();
                if (currentNoteId === itemId) {
                    mainHeader.textContent = newName;
                }
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    initializeEditor();
    setupSearch();

    chrome.storage.local.get(["notes", "activeNoteId"], (result) => {
        const notes = result.notes || [];
        currentNoteId = result.activeNoteId || null;

        if (notes.length > 0) {
            if (currentNoteId) {
                const note = findItemById(notes, currentNoteId);
                if (note) {
                    loadNoteContent(currentNoteId);
                } else {
                    const firstNote = findFirstNote(notes);
                    if (firstNote) {
                        loadNoteContent(firstNote.id);
                    }
                }
            } else {
                const firstNote = findFirstNote(notes);
                if (firstNote) {
                    loadNoteContent(firstNote.id);
                }
            }
        }
    });
});

function findFirstNote(items) {
    for (const item of items) {
        if (item.type === "note") {
            return item;
        }
        if (item.children && item.children.length > 0) {
            const found = findFirstNote(item.children);
            if (found) return found;
        }
    }
    return null;
}

const style = document.createElement('style');
style.textContent = `
    .note.active {
        background-color: #e3f2fd;
        border-radius: 4px;
    }
    
    .note:hover {
        background-color: #f5f5f5;
        border-radius: 4px;
    }
    
    .folder:hover {
        background-color: #f5f5f5;
        border-radius: 4px;
    }
`;
document.head.appendChild(style);

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
        if (isDeleting) return;

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
        blurTimeout = setTimeout(finishRename, 200);
    };

    const handleClick = (e) => {
        e.stopPropagation();
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
                setTimeout(() => {
                    startRename(itemElement);
                }, 10);
            }
            break;
        case "deleteNote":
            if (itemElement && !isDeleting) {
                deleteItem(itemElement.dataset.id);
            }
            break;
    }
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
    if (isDeleting) return;
    isDeleting = true;

    const existingModal = document.querySelector('.delete-modal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }

    const modal = document.createElement('div');
    modal.className = 'delete-modal';
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
    dialog.style.minWidth = '300px';
    dialog.innerHTML = `
        <p style="margin: 0 0 15px 0;">Are you sure you want to delete this item?</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancelDelete" style="padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="confirmDelete" style="padding: 8px 16px; border: 1px solid #dc3545; background: #dc3545; color: white; border-radius: 4px; cursor: pointer;">Delete</button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const cancelDelete = document.getElementById('cancelDelete');
    const confirmDelete = document.getElementById('confirmDelete');

    const cleanupModal = () => {
        if (document.body.contains(modal)) {
            document.body.removeChild(modal);
        }
        isDeleting = false;
    };

    const cancelHandler = () => {
        cleanupModal();
    };

    const confirmHandler = () => {
        chrome.storage.local.get(["notes", "activeNoteId"], (result) => {
            const notes = result.notes || [];
            const activeNoteId = result.activeNoteId;
            const updatedNotes = removeItemById(notes, itemId);

            let newActiveNoteId = activeNoteId;
            if (activeNoteId === itemId) {
                newActiveNoteId = null;
                const firstNote = findFirstNote(updatedNotes);
                if (firstNote) {
                    newActiveNoteId = firstNote.id;
                }
            }

            chrome.storage.local.set({ notes: updatedNotes, activeNoteId: newActiveNoteId }, () => {
                cleanupModal();
                sideBar();
                if (currentNoteId === itemId) {
                    currentNoteId = newActiveNoteId;
                    mainHeader.textContent = "My Notes";
                    if (quill) {
                        quill.root.innerHTML = "";
                    }
                    if (newActiveNoteId) {
                        loadNoteContent(newActiveNoteId);
                    }
                }
            });
        });
    };

    cancelDelete.onclick = cancelHandler;
    confirmDelete.onclick = confirmHandler;

    modal.onclick = (e) => {
        if (e.target === modal) {
            cancelHandler();
        }
    };

    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            cancelHandler();
            document.removeEventListener('keydown', keyHandler);
        }
    };

    document.addEventListener('keydown', keyHandler);
}

function removeItemById(items, id) {
    return items.filter(item => {
        if (item.id === id) {
            if (item.type === "folder" && item.children) {
                removeFolderState(item.id);
            }
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
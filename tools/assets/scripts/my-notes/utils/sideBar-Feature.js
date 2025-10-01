const notesList = document.getElementById("notesList");
const contextMenu = document.getElementById("contextMenu");
const mainHeader = document.querySelector(".MainHeader h3");
const searchItem = document.getElementById("searchNotes");
const exportNoteItem = document.getElementById("exportNote");

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
                ['link', 'image', 'video', 'table']
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

        // Hide Export to PDF for folders, show for notes
        if (li && li.dataset.type === "folder") {
            exportNoteItem.style.display = "none";
        } else {
            exportNoteItem.style.display = "block";
        }

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
            // Reset display when menu closes
            document.getElementById("exportNote").style.display = "block";
        }
    });

    contextMenu.addEventListener("click", (e) => {
        const menuItem = e.target.closest("li");
        if (menuItem) {
            const action = menuItem.id;
            handleContextMenuAction(action, selectedItem);
        }
        contextMenu.style.display = "none";
        // Reset display after action
        document.getElementById("exportNote").style.display = "block";
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
        case "exportNote":
            exportQuillToPDF(itemElement, quill);
            break;
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
async function exportQuillToPDF(itemElement, quill) {
    if (!itemElement || !quill) return;
    const noteId = itemElement.dataset.id;
    const noteTitle = itemElement.querySelector('.item-text')?.textContent || 'Untitled';
    showLoadingIndicator(true);

    chrome.storage.local.get(["notes"], async (result) => {
        const notes = result.notes || [];

        // Use the recursive find function to search through nested structure
        const note = findItemById(notes, noteId);

        if (!note) {
            console.error('Note not found. Looking for ID:', noteId, 'Available notes:', notes);
            showLoadingIndicator(false);
            alert('Note not found!');
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded.');
            showLoadingIndicator(false);
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const maxWidth = pageWidth - 2 * margin;
            const footerHeight = 20;
            let y = margin;
            let page = 1;
            let listLevel = 0;
            let listCounters = {};

            const addFooter = () => {
                const exportDate = new Date().toLocaleString();
                doc.setFontSize(8);
                doc.setTextColor(128);
                doc.text(`Exported on: ${exportDate}`, margin, pageHeight - 10);
                doc.text(`Page ${page}`, pageWidth - margin - doc.getTextWidth(`Page ${page}`), pageHeight - 10);
                doc.setTextColor(0);
            };

            addFooter();

            // Function to extract text content from element including nested elements
            const getElementText = (element) => {
                if (element.nodeType === Node.TEXT_NODE) {
                    return element.textContent || '';
                }

                let text = '';
                for (const child of element.childNodes) {
                    text += getElementText(child);
                }
                return text;
            };

            // Function to get element styling including inline styles
            const getElementStyle = (element) => {
                if (element.nodeType !== Node.ELEMENT_NODE) {
                    return {
                        fontSize: 12,
                        fontWeight: 'normal',
                        fontStyle: 'normal',
                        color: '#000000',
                        textDecoration: 'none',
                        backgroundColor: 'transparent',
                        marginLeft: 0,
                        marginTop: 0,
                        marginBottom: 0
                    };
                }

                const style = window.getComputedStyle(element);

                // Check for inline styles first (higher priority)
                const inlineStyle = element.style;
                const computedStyle = {
                    fontSize: inlineStyle.fontSize || style.fontSize,
                    fontWeight: inlineStyle.fontWeight || style.fontWeight,
                    fontStyle: inlineStyle.fontStyle || style.fontStyle,
                    color: inlineStyle.color || style.color,
                    fontFamily: inlineStyle.fontFamily || style.fontFamily,
                    backgroundColor: inlineStyle.backgroundColor || style.backgroundColor,
                    textAlign: inlineStyle.textAlign || style.textAlign,
                    textDecoration: inlineStyle.textDecoration || style.textDecoration,
                    textDecorationLine: inlineStyle.textDecorationLine || style.textDecorationLine,
                    marginLeft: inlineStyle.marginLeft || style.marginLeft,
                    marginTop: inlineStyle.marginTop || style.marginTop,
                    marginBottom: inlineStyle.marginBottom || style.marginBottom
                };

                return {
                    fontSize: parseInt(computedStyle.fontSize) * 0.75 || 12,
                    fontWeight: computedStyle.fontWeight,
                    fontStyle: computedStyle.fontStyle,
                    color: computedStyle.color,
                    fontFamily: computedStyle.fontFamily,
                    backgroundColor: computedStyle.backgroundColor,
                    textAlign: computedStyle.textAlign,
                    textDecoration: computedStyle.textDecoration || computedStyle.textDecorationLine,
                    marginLeft: parseInt(computedStyle.marginLeft) || 0,
                    marginTop: parseInt(computedStyle.marginTop) || 0,
                    marginBottom: parseInt(computedStyle.marginBottom) || 0
                };
            };

            // Function to apply styling to PDF document
            const applyStyle = (doc, style) => {
                let font = 'helvetica';
                if (style.fontFamily) {
                    if (style.fontFamily.includes('times') || style.fontFamily.includes('serif')) {
                        font = 'times';
                    } else if (style.fontFamily.includes('courier') || style.fontFamily.includes('monospace')) {
                        font = 'courier';
                    }
                }

                let fontStyle = 'normal';
                if ((style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700) && style.fontStyle === 'italic') {
                    fontStyle = 'bolditalic';
                } else if (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700) {
                    fontStyle = 'bold';
                } else if (style.fontStyle === 'italic') {
                    fontStyle = 'italic';
                }

                doc.setFont(font, fontStyle);
                doc.setFontSize(Math.max(8, Math.min(72, style.fontSize)));

                // Set text color
                const rgb = style.color.match(/\d+/g);
                if (rgb && rgb.length >= 3) {
                    doc.setTextColor(parseInt(rgb[0]), parseInt(rgb[1]), parseInt(rgb[2]));
                }

                return doc;
            };

            // Function to draw text with background color
            const drawTextWithBackground = (doc, text, x, y, style) => {
                const fontSize = doc.getFontSize();
                const textWidth = doc.getTextWidth(text);
                const textHeight = fontSize * 0.3528;

                // Draw background if not transparent
                if (style.backgroundColor && style.backgroundColor !== 'transparent' &&
                    style.backgroundColor !== 'rgba(0, 0, 0, 0)') {

                    const bgRgb = style.backgroundColor.match(/\d+/g);
                    if (bgRgb && bgRgb.length >= 3) {
                        const alpha = bgRgb.length === 4 ? parseFloat(bgRgb[3]) : 1;
                        if (alpha > 0) {
                            doc.setFillColor(parseInt(bgRgb[0]), parseInt(bgRgb[1]), parseInt(bgRgb[2]));
                            doc.rect(x, y - textHeight + 2, textWidth, textHeight + 1, 'F');
                        }
                    }
                }

                // Draw text
                doc.text(text, x, y);

                // Draw underline and strikethrough
                if (style.textDecoration) {
                    const underlineY = y + 1;
                    const lineThroughY = y - textHeight / 2 + 1;

                    if (style.textDecoration.includes('underline')) {
                        doc.setDrawColor(0);
                        doc.line(x, underlineY, x + textWidth, underlineY);
                    }

                    if (style.textDecoration.includes('line-through')) {
                        doc.setDrawColor(0);
                        doc.line(x, lineThroughY, x + textWidth, lineThroughY);
                    }
                }
            };

            // Function to process Quill.js specific formatting
            const processQuillFormatting = (element, style) => {
                // Handle Quill.js specific classes and data attributes
                const classes = element.classList;
                const dataAttributes = element.dataset;

                // Check for Quill formatting classes
                if (classes.contains('ql-font-serif')) {
                    style.fontFamily = 'times, serif';
                } else if (classes.contains('ql-font-monospace')) {
                    style.fontFamily = 'courier, monospace';
                }

                // Check for Quill size classes
                if (classes.contains('ql-size-small')) {
                    style.fontSize = 10;
                } else if (classes.contains('ql-size-large')) {
                    style.fontSize = 18;
                } else if (classes.contains('ql-size-huge')) {
                    style.fontSize = 24;
                }

                // Check for Quill alignment classes
                if (classes.contains('ql-align-center')) {
                    style.textAlign = 'center';
                } else if (classes.contains('ql-align-right')) {
                    style.textAlign = 'right';
                } else if (classes.contains('ql-align-justify')) {
                    style.textAlign = 'justify';
                }

                // Check for Quill heading classes
                if (classes.contains('ql-header-1')) {
                    style.fontSize = 24;
                    style.fontWeight = 'bold';
                } else if (classes.contains('ql-header-2')) {
                    style.fontSize = 20;
                    style.fontWeight = 'bold';
                } else if (classes.contains('ql-header-3')) {
                    style.fontSize = 16;
                    style.fontWeight = 'bold';
                }

                // Check for blockquote class
                if (classes.contains('ql-blockquote')) {
                    style.marginLeft = 20;
                    style.fontStyle = 'italic';
                    style.color = '#666';
                }

                // Check for code block class
                if (classes.contains('ql-code-block')) {
                    style.fontFamily = 'courier, monospace';
                    style.backgroundColor = '#f5f5f5';
                }

                // Check for Quill formatting from data attributes and classes
                if (dataAttributes.bold === 'true' || classes.contains('ql-bold')) {
                    style.fontWeight = 'bold';
                }
                if (dataAttributes.italic === 'true' || classes.contains('ql-italic')) {
                    style.fontStyle = 'italic';
                }
                if (dataAttributes.underline === 'true' || classes.contains('ql-underline')) {
                    style.textDecoration = style.textDecoration ? style.textDecoration + ' underline' : 'underline';
                }
                if (dataAttributes.strike === 'true' || classes.contains('ql-strike')) {
                    style.textDecoration = style.textDecoration ? style.textDecoration + ' line-through' : 'line-through';
                }

                // Check for background color classes
                if (classes.contains('ql-background')) {
                    const bgColor = element.style.backgroundColor;
                    if (bgColor) {
                        style.backgroundColor = bgColor;
                    }
                }

                // Handle specific Quill format spans
                if (element.tagName.toLowerCase() === 'span') {
                    const styleAttr = element.getAttribute('style');
                    if (styleAttr) {
                        // Parse inline style for background color
                        const bgMatch = styleAttr.match(/background-color:\s*([^;]+)/);
                        if (bgMatch) {
                            style.backgroundColor = bgMatch[1];
                        }

                        // Parse inline style for text decoration
                        const underlineMatch = styleAttr.match(/text-decoration:\s*([^;]+)/);
                        if (underlineMatch && underlineMatch[1].includes('underline')) {
                            style.textDecoration = style.textDecoration ? style.textDecoration + ' underline' : 'underline';
                        }
                    }
                }

                return style;
            };

            // Function to get list bullet/number based on level and type
            const getListMarker = (element, index) => {
                const tag = element.tagName.toLowerCase();
                const type = element.getAttribute('type');

                if (tag === 'ol') {
                    switch (type) {
                        case 'a': return String.fromCharCode(97 + index) + '.';
                        case 'A': return String.fromCharCode(65 + index) + '.';
                        case 'i': return (index + 1) + '.';
                        case 'I': return (index + 1) + '.';
                        default: return (index + 1) + '.';
                    }
                } else if (tag === 'ul') {
                    const style = element.getAttribute('style');
                    if (style && style.includes('circle')) return '○';
                    if (style && style.includes('square')) return '■';
                    return '•';
                }
                return '•';
            };

            const processNode = async (node, parentStyle = null, listInfo = {}) => {
                // Skip empty text nodes
                if (node.nodeType === Node.TEXT_NODE) {
                    const textContent = node.textContent || '';
                    const trimmedText = textContent.trim();

                    // Skip empty text nodes
                    if (!trimmedText) return;

                    // Use parent style for text nodes
                    const currentStyle = parentStyle || getElementStyle(node.parentElement);
                    const processedStyle = processQuillFormatting(node.parentElement, { ...currentStyle });
                    applyStyle(doc, processedStyle);

                    // Calculate indentation for lists
                    let indent = margin;
                    if (listInfo.level > 0) {
                        indent = margin + (listInfo.level * 15);
                    }

                    const lines = doc.splitTextToSize(trimmedText, maxWidth - (indent - margin));
                    for (const line of lines) {
                        // Skip empty lines
                        if (!line || line.trim() === '') continue;

                        if (y + doc.getFontSize() * 0.3528 * 1.2 > pageHeight - margin - footerHeight) {
                            doc.addPage();
                            page++;
                            y = margin;
                            addFooter();
                        }

                        // Add list marker for first line of list item
                        if (listInfo.isListItem && !listInfo.markerAdded) {
                            const marker = getListMarker(listInfo.listElement, listInfo.index);
                            const markerWidth = doc.getTextWidth(marker + ' ');
                            doc.text(marker, indent - 10, y);
                            listInfo.markerAdded = true;
                        }

                        // Ensure line is a valid string
                        if (line && typeof line === 'string' && line.trim() !== '') {
                            drawTextWithBackground(doc, line, indent, y, processedStyle);
                            y += doc.getFontSize() * 0.3528 * 1.2;
                        }
                    }

                    // Reset to default style after text
                    if (parentStyle) {
                        applyStyle(doc, {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent'
                        });
                    }
                }
                else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName.toLowerCase();

                    if (tag === 'br') {
                        y += doc.getFontSize() * 0.3528;
                    }
                    else if (tag === 'img') {
                        try {
                            const img = new Image();
                            img.crossOrigin = 'Anonymous';
                            img.src = node.src;

                            await new Promise((resolve, reject) => {
                                img.onload = () => {
                                    try {
                                        const w = Math.min(img.width, maxWidth);
                                        const h = (img.height * w) / img.width;

                                        if (y + h > pageHeight - margin - footerHeight) {
                                            doc.addPage();
                                            page++;
                                            y = margin;
                                            addFooter();
                                        }

                                        doc.addImage(img, 'JPEG', margin, y, w, h);
                                        y += h + 5;
                                        resolve();
                                    } catch (error) {
                                        resolve(); // Continue even if image fails
                                    }
                                };
                                img.onerror = () => {
                                    resolve(); // Continue even if image fails
                                };

                                // Set timeout for image loading
                                setTimeout(() => {
                                    resolve();
                                }, 3000);
                            });
                        } catch (error) {
                            console.warn('Error processing image:', error);
                            // Continue processing other content
                        }
                    }
                    else if (tag === 'table') {
                        try {
                            const rows = node.rows;
                            const cellPadding = 2;
                            const defaultRowHeight = 10;

                            // Calculate column widths based on content
                            const colWidths = [];
                            const totalCols = Math.max(...Array.from(rows).map(row => row.cells.length));

                            // Initialize equal widths
                            for (let i = 0; i < totalCols; i++) {
                                colWidths.push(maxWidth / totalCols);
                            }

                            for (let r = 0; r < rows.length; r++) {
                                const cells = rows[r].cells;
                                let maxCellHeight = defaultRowHeight;

                                // First pass: calculate row height
                                for (let c = 0; c < cells.length; c++) {
                                    const cellText = getElementText(cells[c]).trim();
                                    if (cellText) {
                                        const cellStyle = getElementStyle(cells[c]);
                                        const processedStyle = processQuillFormatting(cells[c], cellStyle);
                                        applyStyle(doc, processedStyle);

                                        const lines = doc.splitTextToSize(cellText, colWidths[c] - (2 * cellPadding));
                                        const textHeight = lines.length * doc.getFontSize() * 0.3528 * 1.2;
                                        maxCellHeight = Math.max(maxCellHeight, textHeight + (2 * cellPadding));
                                    }
                                }

                                if (y + maxCellHeight > pageHeight - margin - footerHeight) {
                                    doc.addPage();
                                    page++;
                                    y = margin;
                                    addFooter();
                                }

                                let x = margin;
                                for (let c = 0; c < cells.length; c++) {
                                    const cellText = getElementText(cells[c]).trim();
                                    const cellStyle = getElementStyle(cells[c]);
                                    const processedStyle = processQuillFormatting(cells[c], cellStyle);

                                    // Apply cell styling
                                    applyStyle(doc, processedStyle);

                                    // Draw cell border
                                    doc.rect(x, y, colWidths[c], maxCellHeight);

                                    // Add cell content with background and formatting
                                    if (cellText) {
                                        const lines = doc.splitTextToSize(cellText, colWidths[c] - (2 * cellPadding));
                                        let textY = y + cellPadding + doc.getFontSize() * 0.3528;

                                        for (const line of lines) {
                                            if (line.trim() !== '') {
                                                drawTextWithBackground(doc, line, x + cellPadding, textY, processedStyle);
                                                textY += doc.getFontSize() * 0.3528 * 1.2;
                                            }
                                        }
                                    }

                                    x += colWidths[c];
                                }
                                y += maxCellHeight;
                            }

                            // Reset styling after table
                            applyStyle(doc, {
                                fontSize: 12,
                                fontWeight: 'normal',
                                fontStyle: 'normal',
                                color: '#000000',
                                textDecoration: 'none',
                                backgroundColor: 'transparent'
                            });

                        } catch (error) {
                            console.warn('Error processing table:', error);
                            // Reset styling and continue
                            applyStyle(doc, {
                                fontSize: 12,
                                fontWeight: 'normal',
                                fontStyle: 'normal',
                                color: '#000000',
                                textDecoration: 'none',
                                backgroundColor: 'transparent'
                            });
                        }
                    }
                    else if (tag === 'ol' || tag === 'ul') {
                        // Process lists
                        const listItems = node.querySelectorAll('li');
                        const currentLevel = listLevel;
                        listLevel++;

                        if (!listCounters[currentLevel]) {
                            listCounters[currentLevel] = 0;
                        }

                        for (let i = 0; i < listItems.length; i++) {
                            listCounters[currentLevel]++;
                            const listInfo = {
                                level: currentLevel,
                                index: i,
                                listElement: node,
                                isListItem: true,
                                markerAdded: false
                            };

                            await processNode(listItems[i], parentStyle, listInfo);

                            // Add extra space after list item
                            y += doc.getFontSize() * 0.3528 * 0.5;
                        }

                        listLevel--;
                        if (listLevel === 0) {
                            listCounters = {};
                        }
                    }
                    else if (tag === 'li') {
                        // Process list item content
                        for (const child of node.childNodes) {
                            await processNode(child, parentStyle, listInfo);
                        }
                    }
                    else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
                        // Handle headings
                        const level = parseInt(tag.charAt(1));
                        const headingStyle = {
                            fontSize: 28 - (level * 4),
                            fontWeight: 'bold',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent',
                            marginTop: 10,
                            marginBottom: 5
                        };

                        applyStyle(doc, headingStyle);

                        const text = getElementText(node).trim();
                        if (text) {
                            if (y + doc.getFontSize() * 0.3528 * 1.5 > pageHeight - margin - footerHeight) {
                                doc.addPage();
                                page++;
                                y = margin;
                                addFooter();
                            }

                            doc.text(text, margin, y);
                            y += doc.getFontSize() * 0.3528 * 1.5;
                        }

                        // Reset style after heading
                        applyStyle(doc, {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent'
                        });
                    }
                    else if (tag === 'blockquote') {
                        // Handle blockquotes
                        const quoteStyle = {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'italic',
                            color: '#666666',
                            textDecoration: 'none',
                            backgroundColor: '#f9f9f9',
                            marginLeft: 20,
                            marginTop: 5,
                            marginBottom: 5
                        };

                        applyStyle(doc, quoteStyle);

                        // Draw quote background
                        doc.setFillColor(240, 240, 240);
                        doc.rect(margin, y - 2, maxWidth, doc.getFontSize() * 0.3528 * 1.5 + 4, 'F');

                        const text = getElementText(node).trim();
                        if (text) {
                            const lines = doc.splitTextToSize(text, maxWidth - 10);
                            for (const line of lines) {
                                if (y + doc.getFontSize() * 0.3528 * 1.2 > pageHeight - margin - footerHeight) {
                                    doc.addPage();
                                    page++;
                                    y = margin;
                                    addFooter();
                                }

                                doc.text(line, margin + 5, y);
                                y += doc.getFontSize() * 0.3528 * 1.2;
                            }
                        }

                        y += 5; // Extra space after quote

                        // Reset style after quote
                        applyStyle(doc, {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent'
                        });
                    }
                    else if (tag === 'pre' || tag === 'code') {
                        // Handle code blocks
                        const codeStyle = {
                            fontSize: 10,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#333333',
                            textDecoration: 'none',
                            backgroundColor: '#f5f5f5',
                            fontFamily: 'courier, monospace'
                        };

                        applyStyle(doc, codeStyle);

                        // Draw code background
                        doc.setFillColor(245, 245, 245);
                        doc.rect(margin, y - 2, maxWidth, doc.getFontSize() * 0.3528 * 1.5 + 4, 'F');

                        const text = getElementText(node).trim();
                        if (text) {
                            const lines = doc.splitTextToSize(text, maxWidth - 10);
                            for (const line of lines) {
                                if (y + doc.getFontSize() * 0.3528 * 1.2 > pageHeight - margin - footerHeight) {
                                    doc.addPage();
                                    page++;
                                    y = margin;
                                    addFooter();
                                }

                                doc.text(line, margin + 5, y);
                                y += doc.getFontSize() * 0.3528 * 1.2;
                            }
                        }

                        y += 5; // Extra space after code block

                        // Reset style after code
                        applyStyle(doc, {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent'
                        });
                    }
                    else if (tag === 'strong' || tag === 'b') {
                        // Handle bold text specifically
                        const style = getElementStyle(node);
                        const processedStyle = { ...style, fontWeight: 'bold' };
                        applyStyle(doc, processedStyle);

                        for (const child of node.childNodes) {
                            await processNode(child, processedStyle, listInfo);
                        }
                    }
                    else if (tag === 'em' || tag === 'i') {
                        // Handle italic text specifically
                        const style = getElementStyle(node);
                        const processedStyle = { ...style, fontStyle: 'italic' };
                        applyStyle(doc, processedStyle);

                        for (const child of node.childNodes) {
                            await processNode(child, processedStyle, listInfo);
                        }
                    }
                    else if (tag === 'u') {
                        // Handle underline text specifically
                        const style = getElementStyle(node);
                        const processedStyle = {
                            ...style,
                            textDecoration: style.textDecoration ? style.textDecoration + ' underline' : 'underline'
                        };
                        applyStyle(doc, processedStyle);

                        for (const child of node.childNodes) {
                            await processNode(child, processedStyle, listInfo);
                        }
                    }
                    else if (tag === 's' || tag === 'strike') {
                        // Handle strikethrough text specifically
                        const style = getElementStyle(node);
                        const processedStyle = {
                            ...style,
                            textDecoration: style.textDecoration ? style.textDecoration + ' line-through' : 'line-through'
                        };
                        applyStyle(doc, processedStyle);

                        for (const child of node.childNodes) {
                            await processNode(child, processedStyle, listInfo);
                        }
                    }
                    else if (tag === 'p' || tag === 'div') {
                        // Handle paragraphs and divs with proper spacing
                        const style = getElementStyle(node);
                        const processedStyle = processQuillFormatting(node, style);

                        // Add top margin
                        if (processedStyle.marginTop > 0) {
                            y += processedStyle.marginTop;
                        }

                        applyStyle(doc, processedStyle);

                        // Process child nodes
                        for (const child of node.childNodes) {
                            await processNode(child, processedStyle, listInfo);
                        }

                        // Add bottom margin
                        if (processedStyle.marginBottom > 0) {
                            y += processedStyle.marginBottom;
                        } else {
                            y += doc.getFontSize() * 0.3528 * 0.5; // Default paragraph spacing
                        }

                        // Reset to default after processing children
                        applyStyle(doc, {
                            fontSize: 12,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            color: '#000000',
                            textDecoration: 'none',
                            backgroundColor: 'transparent'
                        });
                    }
                    else {
                        // Process other elements (span, etc.) with inline styles
                        try {
                            const style = getElementStyle(node);
                            const processedStyle = processQuillFormatting(node, style);

                            // Apply the style for this element
                            applyStyle(doc, processedStyle);

                            // Process child nodes with current style as parent style
                            for (const child of node.childNodes) {
                                await processNode(child, processedStyle, listInfo);
                            }

                            // Reset to default after processing children
                            applyStyle(doc, {
                                fontSize: 12,
                                fontWeight: 'normal',
                                fontStyle: 'normal',
                                color: '#000000',
                                textDecoration: 'none',
                                backgroundColor: 'transparent'
                            });

                        } catch (error) {
                            console.warn('Error processing element:', tag, error);
                            // Reset to default and continue
                            applyStyle(doc, {
                                fontSize: 12,
                                fontWeight: 'normal',
                                fontStyle: 'normal',
                                color: '#000000',
                                textDecoration: 'none',
                                backgroundColor: 'transparent'
                            });
                        }
                    }
                }
            };

            // Create temporary container and process content
            const temp = document.createElement('div');
            temp.innerHTML = note.content || '';

            // Process each child node with error handling
            for (const child of temp.childNodes) {
                try {
                    await processNode(child);
                } catch (error) {
                    console.warn('Error processing node:', error);
                    // Continue with next node
                }
            }

            // Save the PDF
            const fileName = noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + Date.now() + '.pdf';
            doc.save(fileName);
            showExportSuccess(noteTitle);

        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Error generating PDF: ' + error.message);
        } finally {
            showLoadingIndicator(false);
        }
    });
}



function showLoadingIndicator(show) {
    let indicator = document.getElementById('pdfLoadingIndicator');

    if (show) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'pdfLoadingIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 20px 30px;
                border-radius: 8px;
                z-index: 10000;
                font-family: 'Poppins', sans-serif;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            indicator.innerHTML = `
                <div style="width: 20px; height: 20px; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                Generating PDF...
            `;
            document.body.appendChild(indicator);
        }
        indicator.style.display = 'flex';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

function showExportSuccess(title) {
    const existingToast = document.getElementById('pdfExportToast');
    if (existingToast) {
        document.body.removeChild(existingToast);
    }

    const toast = document.createElement('div');
    toast.id = 'pdfExportToast';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: 'Poppins', sans-serif;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
    `;

    const truncatedTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;
    toast.innerHTML = `
        <strong>PDF Exported Successfully!</strong><br>
        <small>"${truncatedTitle}" has been downloaded.</small>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }
    }, 3000);
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
        if (item.id === id) {
            return item;
        }
        if (item.children && item.children.length > 0) {
            const found = findItemById(item.children, id);
            if (found) return found;
        }
    }
    return null;
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
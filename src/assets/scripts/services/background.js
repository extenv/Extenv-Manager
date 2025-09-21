let isCreatingMenu = false;

function createMainMenu() {
    if (isCreatingMenu) return;
    isCreatingMenu = true;
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "savePage",
            title: "Save this Page",
            contexts: ["page"]
        }, () => {
            if (chrome.runtime.lastError) {
                // ignore
            }
        });

        chrome.contextMenus.create({
            id: "saveLink",
            title: "Save this Link",
            contexts: ["link"]
        }, () => {
            if (chrome.runtime.lastError) {
                // ignore
            }
        });

        addFolderMenus().finally(() => {
            isCreatingMenu = false;
        });
    });
}

async function addFolderMenus() {
    const folders = await getAllFolders();
    folders.forEach(folder => {
        if (!folder.title) return;

        ["savePage", "saveLink"].forEach(parent => {
            chrome.contextMenus.create({
                id: `${parent}-folder-${folder.id}`,
                parentId: parent,
                title: folder.title,
                contexts: ["page", "link"]
            });
        });
    });
}

function getAllFolders() {
    return new Promise((resolve) => {
        chrome.bookmarks.getTree((nodes) => {
            const folders = [];
            function traverse(node) {
                if (!node.url) folders.push(node);
                if (node.children) node.children.forEach(traverse);
            }
            nodes.forEach(traverse);
            resolve(folders);
        });
    });
}

function getUniqueTitle(folderId, title) {
    return new Promise((resolve) => {
        chrome.bookmarks.getChildren(folderId, (children) => {
            let existingTitles = children.map(c => c.title);
            if (!existingTitles.includes(title)) return resolve(title);

            let i = 2;
            let newTitle = `${title} (${i})`;
            while (existingTitles.includes(newTitle)) {
                i++;
                newTitle = `${title} (${i})`;
            }
            resolve(newTitle);
        });
    });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const match = info.menuItemId.match(/folder-(.+)$/);
    if (!match) return;

    const folderId = match[1];
    let title = tab && tab.title ? tab.title : info.linkText || info.linkUrl;
    const url = tab && tab.url ? tab.url : info.linkUrl;
    const finalTitle = await getUniqueTitle(folderId, title);

    chrome.bookmarks.create({
        parentId: folderId,
        title: finalTitle,
        url: url
    });
});

chrome.bookmarks.onCreated.addListener(createMainMenu);
chrome.bookmarks.onRemoved.addListener(createMainMenu);
chrome.bookmarks.onChanged.addListener(createMainMenu);
chrome.bookmarks.onMoved.addListener(createMainMenu);
chrome.bookmarks.onChildrenReordered.addListener(createMainMenu);
chrome.bookmarks.onImportEnded.addListener(createMainMenu);

chrome.runtime.onInstalled.addListener(createMainMenu);
chrome.runtime.onStartup.addListener(createMainMenu);

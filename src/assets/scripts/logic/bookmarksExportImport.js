
import { loadBookmarks } from '../logic/bookmarks.js';

export function initBookmarksExportImport() {
    const selectFormat = document.getElementById('selectFormat');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');


    // Export
    exportBtn.addEventListener('click', () => {
        const format = selectFormat.value;
        chrome.bookmarks.getTree((tree) => {

            const filteredTree = filterBookmarksBarAndOther(tree);

            if (format === 'json') {
                const formattedData = convertToDesiredFormat(filteredTree);
                const data = JSON.stringify(formattedData, null, 2);
                downloadBlob(data, 'application/json', 'bookmarks.json');
            } else if (format === 'html') {
                const html = bookmarksToHTML(filteredTree);
                downloadBlob(html, 'text/html', 'bookmarks.html');
            } else {
                alert('Please select a format first!');
            }
        });
    });

    function filterBookmarksBarAndOther(tree) {
        const result = [];

        tree.forEach(root => {
            if (root.children) {
                root.children.forEach(child => {
                    result.push(child);
                });
            }
        });

        return result;
    }

    function convertToDesiredFormat(nodes) {
        const result = [];

        nodes.forEach(node => {
            const formattedNode = {
                type: node.children ? 'folder' : 'link',
                addDate: Math.floor(new Date(node.dateAdded).getTime() / 1000),
                title: node.title
            };

            if (node.children) {
                formattedNode.lastModified = Math.floor(new Date(node.dateGroupModified || node.dateAdded).getTime() / 1000);
                formattedNode.children = convertToDesiredFormat(node.children);
            } else {
                formattedNode.url = node.url;
            }

            result.push(formattedNode);
        });

        return result;
    }

    function bookmarksToHTML(nodes) {
        let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n';
        html += '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n';
        html += '<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';

        function traverse(bookmarks) {
            bookmarks.forEach(node => {
                if (node.url) html += `<DT><A HREF="${node.url}">${node.title}</A>\n`;
                if (node.children) {
                    html += `<DT><H3>${node.title}</H3>\n<DL><p>\n`;
                    traverse(node.children);
                    html += `</DL><p>\n`;
                }
            });
        }

        traverse(nodes);
        html += '</DL><p>\n';
        return html;
    }

    function downloadBlob(content, type, filename) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Import
    importBtn.addEventListener('click', () => {
        const format = selectFormat.value;

        if (format !== 'json') {
            alert('Only JSON import is supported.');
            return;
        }

        importFile.click();
    });

    importFile.addEventListener('change', () => {
        const file = importFile.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            alert('Only JSON import is supported.');
            importFile.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const bookmarks = JSON.parse(e.target.result);
                importToBookmarksBarAndOther(bookmarks);
                alert('Bookmarks imported successfully!');
                loadBookmarks();
            } catch {
                alert('Invalid JSON file!');
            }
        };
        reader.readAsText(file);
    });


    function importToBookmarksBarAndOther(nodes) {
        chrome.bookmarks.getTree((tree) => {
            const root = tree[0];
            const bookmarksBar = root.children[0];
            const otherBookmarks = root.children[1];

            if (!bookmarksBar || !otherBookmarks) {
                alert('Cannot find bookmarks folders. Creating new ones...');
                createFallbackFolders(nodes);
                return;
            }

            nodes.forEach(node => {
                const normalizedTitle = node.title.toLowerCase().trim();

                if ((normalizedTitle.includes('bookmarks bar') || normalizedTitle === 'bookmarks bar') && node.children) {
                    addBookmarks(node.children, bookmarksBar.id);
                } else if ((normalizedTitle.includes('other bookmarks') || normalizedTitle === 'other bookmarks') && node.children) {
                    addBookmarks(node.children, otherBookmarks.id);
                }
            });
        });
    }

    async function getUniqueTitle(title, parentId) {
        return new Promise((resolve) => {
            chrome.bookmarks.getChildren(parentId, (children) => {
                let existingTitles = children.map(c => c.title);
                if (!existingTitles.includes(title)) {
                    resolve(title);
                    return;
                }

                // kalau sudah ada → cari nama unik (2), (3), ...
                let counter = 2;
                let newTitle = `${title} (${counter})`;
                while (existingTitles.includes(newTitle)) {
                    counter++;
                    newTitle = `${title} (${counter})`;
                }
                resolve(newTitle);
            });
        });
    }

    async function addBookmarks(nodes, parentId) {
        for (const node of nodes) {
            if (node.url) {
                const uniqueTitle = await getUniqueTitle(node.title, parentId);
                chrome.bookmarks.create({
                    parentId,
                    title: uniqueTitle,
                    url: node.url
                });
            } else if (node.children) {
                const uniqueTitle = await getUniqueTitle(node.title, parentId);
                chrome.bookmarks.create({
                    parentId,
                    title: uniqueTitle
                }, (newFolder) => {
                    addBookmarks(node.children, newFolder.id);
                });
            }
        }
    }

    function createFallbackFolders(nodes) {
        chrome.bookmarks.create({ title: "Bookmarks Bar" }, (bookmarksBar) => {
            chrome.bookmarks.create({ title: "Other Bookmarks" }, (otherBookmarks) => {
                nodes.forEach(node => {
                    const normalizedTitle = node.title.toLowerCase().trim();

                    if ((normalizedTitle.includes("bookmarks bar") || normalizedTitle === "bookmarks bar") && node.children) {
                        addBookmarks(node.children, bookmarksBar.id);
                    } else if ((normalizedTitle.includes("other bookmarks") || normalizedTitle === "other bookmarks") && node.children) {
                        addBookmarks(node.children, otherBookmarks.id);
                    }
                });
            });
        });
    }


    chrome.bookmarks.onCreated.addListener(() => loadBookmarks());
    chrome.bookmarks.onRemoved.addListener(() => loadBookmarks());
    chrome.bookmarks.onChanged.addListener(() => loadBookmarks());
    chrome.bookmarks.onMoved.addListener(() => loadBookmarks());


}

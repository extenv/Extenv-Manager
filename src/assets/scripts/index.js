// Import
import { tabs } from './utils/tabs.js';
import { applySettings } from './logic/settings.js';
import { loadBookmarks } from './logic/bookmarks.js';
import { ToolItems } from './logic/tools.js';
import { initBookmarksExportImport } from './logic/bookmarksExportImport.js';

// Tab Menus
tabs();

// Apply Settings
applySettings();

// Load Bookmarks
loadBookmarks();

// Load Tools
ToolItems();

// Init Export / Import
initBookmarksExportImport();
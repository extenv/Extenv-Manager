// import
import { DEFAULT_FONT_SIZE, DEFAULT_LINK_COLOR, DEFAULT_FONT_FAMILY, DEFAULT_FOLDER_COLOR } from '../utils/constant.js';

// --- get elements ---
const treeEl = document.getElementById('tree');
const fontSizeInput = document.getElementById('fontSize');
const fontFamilySelect = document.getElementById('fontFamily');
const folderColorInput = document.getElementById('folderColor');
const linkColorInput = document.getElementById('linkColor');

// --- default values ---

// --- helper to save / load settings using localStorage ---
async function getSettings() {
    const settings = localStorage.getItem('settings');
    if (!settings) return {};
    try {
        return JSON.parse(settings);
    } catch {
        return {};
    }
}

async function setSettings(newSettings) {
    const current = await getSettings();
    const merged = { ...current, ...newSettings };
    localStorage.setItem('settings', JSON.stringify(merged));
}

// --- apply settings to the tree ---
export async function applySettings() {
    const settings = await getSettings();
    if (!treeEl) return;

    // font size & family
    treeEl.style.fontSize = (settings.fontSize || DEFAULT_FONT_SIZE) + "px";
    treeEl.style.fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;

    document.body.style.fontSize = (settings.fontSize || DEFAULT_FONT_SIZE) + "px";
    document.body.style.fontFamily = settings.fontFamily || DEFAULT_FONT_FAMILY;

    // folder color
    treeEl.querySelectorAll('span.folder').forEach(el => {
        el.style.color = settings.folderColor || DEFAULT_FOLDER_COLOR;
    });

    // link color
    treeEl.querySelectorAll('a').forEach(el => {
        el.style.color = settings.linkColor || DEFAULT_LINK_COLOR;
    });

    // update input UI
    fontSizeInput.value = settings.fontSize || DEFAULT_FONT_SIZE;
    fontFamilySelect.value = settings.fontFamily || DEFAULT_FONT_FAMILY;
    folderColorInput.value = settings.folderColor || DEFAULT_FOLDER_COLOR;
    linkColorInput.value = settings.linkColor || DEFAULT_LINK_COLOR;
}

// --- input event listeners ---
folderColorInput.addEventListener('input', async () => {
    await setSettings({ folderColor: folderColorInput.value });
    applySettings();
});

linkColorInput.addEventListener('input', async () => {
    await setSettings({ linkColor: linkColorInput.value });
    applySettings();
});

fontSizeInput.addEventListener('input', async () => {
    const val = parseInt(fontSizeInput.value) || DEFAULT_FONT_SIZE;
    await setSettings({ fontSize: val });
    applySettings();
});

fontFamilySelect.addEventListener('change', async () => {
    const val = fontFamilySelect.value || DEFAULT_FONT_FAMILY;
    await setSettings({ fontFamily: val });
    applySettings();
});

// --- run applySettings on first load ---
document.addEventListener('DOMContentLoaded', applySettings);

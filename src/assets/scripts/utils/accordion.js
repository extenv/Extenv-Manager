import { storage } from './storage.js';

export async function getExpandedIds() {
    return new Promise(resolve => {
        storage.get({ expanded: [] }, res => resolve(res.expanded || []));
    });
}

export async function setExpandedIds(ids) {
    return new Promise(resolve => {
        storage.set({ expanded: ids }, resolve);
    });
}

export async function toggleExpanded(id) {
    const expanded = await getExpandedIds();
    if (expanded.includes(id)) {
        await setExpandedIds(expanded.filter(x => x !== id));
    } else {
        expanded.push(id);
        await setExpandedIds(expanded);
    }
}
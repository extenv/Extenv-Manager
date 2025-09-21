export const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : {
        get: (keys, cb) => cb({ expanded: [] }),
        set: (obj, cb) => cb()
    };
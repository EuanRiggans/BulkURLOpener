const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "../..");

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function fixture(name) {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, "test/fixtures/legacy", name), "utf8"));
}

function memoryStorage(seed = {}) {
    const entries = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
    return {
        get length() { return entries.size; },
        key(index) { return [...entries.keys()][index] ?? null; },
        getItem(key) { return entries.get(String(key)) ?? null; },
        setItem(key, value) { entries.set(String(key), String(value)); },
        removeItem(key) { entries.delete(String(key)); },
        dump() { return Object.fromEntries(entries); },
    };
}

// These doubles exercise controller logic. They do not parse HTML, render a UI,
// enforce extension permissions/CSP, or simulate a browser worker's lifetime.
function makeElement() {
    const listeners = new Map();
    const classes = new Set();
    let text = "";
    return {
        value: "",
        checked: false,
        options: [],
        selectedIndex: 0,
        children: [],
        style: {},
        innerHTML: "",
        textContent: "",
        classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            contains(name) { return classes.has(name); },
        },
        get length() { return this.options.length; },
        get innerText() { return text; },
        set innerText(value) { text = String(value); this.children = []; },
        addEventListener(type, listener) {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        dispatch(type) {
            for (const listener of listeners.get(type) ?? []) {
                listener({ type, target: this });
            }
        },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); return child; },
        remove(index) {
            if (typeof index === "number") this.options.splice(index, 1);
            else this.removed = true;
        },
        select() { this.selected = true; },
        focus() { this.focused = true; },
    };
}

function createLegacyContext({ raw = {}, extensionLocal = {}, extensionSync = {}, tabs = [], href = "chrome-extension://baseline/popup.html", worker = false } = {}) {
    const localStorage = memoryStorage(raw);
    const local = plain(extensionLocal);
    const sync = plain(extensionSync);
    const calls = { tabs: [], queries: [], windows: [], storageWrites: [], alerts: [], confirms: [], navigations: [], closed: 0 };
    const timers = [];
    const elements = new Map();
    const windowListeners = new Map();
    const startupListeners = [];
    const location = new URL(href);
    location.replace = destination => calls.navigations.push(destination);

    for (const id of [
        "list", "openButton", "copyCurrentOpen", "clearList", "createNewList", "openList", "editList", "deleteList",
        "openSettings", "openHelp", "savedLists", "overrideAutoOpen", "openInPopup", "version", "controls",
        "closeModal", "saveList", "listID", "listName", "exportTextArea", "importData", "importTextArea",
        "toggleOpening", "loadingSpinner", "tabs-to-be-opened", "loading", "completed", "loadURL", "page-title",
        "extractor-container", "extractFrom", "extractTo", "manualExtractButton",
        "reverse-container", "reverseFrom", "reverseTo", "manualReverseButton",
    ]) elements.set(id, makeElement());
    elements.get("savedLists").options = [{ id: "-1", text: "Your saved lists" }];

    function area(name, data) {
        return {
            set(value, callback) {
                Object.assign(data, plain(value));
                calls.storageWrites.push({ area: name, value: plain(value) });
                if (callback) callback();
                return Promise.resolve();
            },
            get(keys, callback) {
                if (typeof keys === "function") { callback = keys; keys = undefined; }
                const result = keys === undefined ? plain(data) : Object.fromEntries(
                    (Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, plain(data[key])])
                );
                if (callback) callback(result);
                return Promise.resolve(result);
            },
        };
    }

    const chrome = {
        runtime: {
            getURL(resource) { return new URL(resource, "chrome-extension://baseline/").href; },
            getManifest() { return { version: "1.12.1" }; },
            onStartup: { addListener(listener) { startupListeners.push(listener); } },
        },
        tabs: {
            create(properties) { calls.tabs.push(plain(properties)); return Promise.resolve({ id: calls.tabs.length }); },
            query(properties, callback) { calls.queries.push(plain(properties)); callback(plain(tabs)); },
        },
        windows: { create(properties) { calls.windows.push(plain(properties)); } },
        storage: { local: area("local", local), sync: area("sync", sync) },
    };
    const globals = {
        chrome,
        console: { log() {}, warn() {}, dir() {} },
        crypto: webcrypto,
        alert(message) { calls.alerts.push(message); },
        confirm(message) { calls.confirms.push(message); return true; },
        setTimeout(callback, delay, ...args) { timers.push({ callback, delay, args }); return timers.length; },
    };
    if (!worker) {
        Object.assign(globals, {
            localStorage,
            document: {
                location,
                getElementById(id) { return elements.get(String(id)) ?? null; },
                getElementsByClassName() { return []; },
                createElement() { return makeElement(); },
            },
            window: {
                location,
                close() { calls.closed++; },
                addEventListener(type, listener) {
                    windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]);
                },
            },
        });
    }
    const context = vm.createContext(globals);
    const run = source => vm.runInContext(source, context, { timeout: 1000 });
    function load(relativePath) {
        return vm.runInContext(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"), context, { filename: relativePath, timeout: 1000 });
    }
    function runNextTimer() {
        const timer = timers.shift();
        if (!timer) throw new Error("No pending legacy timer");
        timer.callback(...timer.args);
    }
    function drainTimers() {
        for (let count = 0; timers.length; count++) {
            if (count >= 1000) throw new Error("Legacy timer queue did not finish");
            runNextTimer();
        }
    }
    return {
        context, run, load, calls, localStorage, local, sync, timers, startupListeners, runNextTimer, drainTimers,
        element(id) { return elements.get(id); },
        focusWindow() { for (const listener of windowListeners.get("focus") ?? []) listener(); },
    };
}

function pageContext(settings = {}, raw = {}) {
    const context = createLegacyContext({ raw: { settings: JSON.stringify({ ...fixture("default-settings.json"), ...settings }), ...raw } });
    context.load("app/js/utility.js");
    return context;
}

module.exports = { createLegacyContext, pageContext, fixture };

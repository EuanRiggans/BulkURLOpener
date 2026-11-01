const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLegacyContext, pageContext, fixture } = require("./legacy-context");

test("opening: newline styles and surrounding whitespace retain URL order", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    page.element("list").value = " https://one.example.test/ \r\n\rhttps://two.example.test/\nhttps://three.example.test/\n";
    page.element("openButton").dispatch("click");
    page.drainTimers();
    assert.deepEqual(page.calls.tabs.map(tab => tab.url), ["https://one.example.test/", "https://two.example.test/", "https://three.example.test/"]);
});

test("opening: immediate batches apply deduplication, reverse and final-tab activation", () => {
    const page = pageContext({ automatically_remove_duplicate_urls: 1, open_urls_in_reverse_order: 1, new_tabs_active: 1 });
    page.load("app/js/main-interface.js");
    page.run("openList('https://one.example.test/\\nhttps://two.example.test/\\nhttps://one.example.test/')");
    page.drainTimers();
    assert.deepEqual(page.calls.tabs, [{ active: false, url: "https://two.example.test/" }, { active: true, url: "https://one.example.test/" }]);
});

test("opening: ordinary search phrases use the selected search provider", () => {
    for (const [search_engine, expected] of [
        ["googleEngine", "http://www.google.com/search?q=hello%20world"],
        ["duckduckgoEngine", "https://duckduckgo.com/?q=hello%20world"],
        ["bingEngine", "https://www.bing.com/search?q=hello%20world"],
    ]) {
        const page = pageContext({ search_engine });
        page.run("linksIteratorProcessURL('hello world')");
        assert.equal(page.calls.tabs[0].url, expected);
    }
});

test("opening: ordinary non-URL input can be ignored or extracted", () => {
    const ignored = pageContext({ non_url_handler: "ignoreString" });
    ignored.run("linksIteratorProcessURL('a plain sentence')");
    assert.deepEqual(ignored.calls.tabs, []);
    const extracted = pageContext({ non_url_handler: "attemptToExtractURL" });
    extracted.run("linksIteratorProcessURL('Read https://one.example.test/ now')");
    assert.equal(extracted.calls.tabs[0].url, "https://one.example.test/");
});

test("opening: delayed batches stage their lines and open a dedicated progress page", () => {
    const page = pageContext({ tab_creation_delay: 0.2 });
    page.load("app/js/main-interface.js");
    page.run("openList('https://one.example.test/\\nhttps://two.example.test/')");
    assert.deepEqual(JSON.parse(page.localStorage.getItem("linksToOpen")), { object_description: "link_to_open", list_links: ["https://one.example.test/", "https://two.example.test/"] });
    assert.equal(page.calls.tabs[0].url, "chrome-extension://baseline/openingtabs.html");
    assert.equal(page.calls.tabs.length, 1);
});

test("opening: delayed execution uses fractional delays and supports pause/resume", () => {
    const page = pageContext({ tab_creation_delay: 0.2 }, { linksToOpen: JSON.stringify({ object_description: "link_to_open", list_links: ["https://one.example.test/", "https://two.example.test/"] }) });
    page.load("app/js/openingtabs.js");
    assert.equal(page.calls.tabs.length, 1);
    assert.equal(page.timers[0].delay, 200);
    page.element("toggleOpening").dispatch("click");
    page.runNextTimer();
    assert.equal(page.calls.tabs.length, 1);
    page.element("toggleOpening").dispatch("click");
    page.drainTimers();
    assert.deepEqual(page.calls.tabs.map(tab => tab.url), ["https://one.example.test/", "https://two.example.test/"]);
    assert.equal(page.element("completed").style.display, "block");
});

test("opening: load-on-focus creates inactive extension placeholders", () => {
    const page = pageContext({ load_on_focus: 1 });
    page.run("linksIteratorProcessURL('https://one.example.test/?a=one&b=two')");
    assert.equal(page.calls.tabs[0].active, false);
    assert.equal(new URL(page.calls.tabs[0].url).searchParams.get("url"), "https://one.example.test/?a=one&b=two");
});

test("startup: a selected mirror list opens using startup reverse order", async () => {
    const settings = { ...fixture("default-settings.json"), open_on_launch: "2", open_urls_in_reverse_order: 1 };
    const list = { object_description: "list_storage", list_id: 2, list_name: "Start", list_links: ["https://one.example.test/", "https://two.example.test/"] };
    const worker = createLegacyContext({ worker: true, extensionLocal: { userSettings: settings, lists: [list] } });
    worker.load("app/service-worker.js");
    assert.equal(worker.startupListeners.length, 1);
    await worker.run("browserStartup()");
    worker.drainTimers();
    assert.deepEqual(worker.calls.tabs.map(tab => tab.url), ["https://two.example.test/", "https://one.example.test/"]);
});

test("startup: a fresh worker with no saved settings performs no opening", async () => {
    const worker = createLegacyContext({ worker: true });
    worker.load("app/service-worker.js");
    await worker.run("browserStartup()");
    assert.deepEqual(worker.calls.tabs, []);
});

test("startup: zero is a valid selected list identity", async () => {
    const exported = fixture("zero-id-export.json");
    const worker = createLegacyContext({ worker: true, extensionLocal: { userSettings: exported.settings, lists: exported.lists } });
    worker.load("app/service-worker.js");
    await worker.run("browserStartup()");
    worker.drainTimers();
    assert.deepEqual(worker.calls.tabs.map(tab => tab.url), exported.lists[0].list_links);
});

for (const [scope, expected] of [["currentWindow", { currentWindow: true }], ["allOpenedTabs", {}]]) {
    test(`capture: ${scope} requests the intended tab scope`, () => {
        const page = createLegacyContext({ raw: { settings: JSON.stringify({ ...fixture("default-settings.json"), currently_opened_tabs_display: scope }) }, tabs: [{ url: "https://one.example.test/" }, { url: "https://two.example.test/" }] });
        page.load("app/js/utility.js");
        page.load("app/js/main-interface.js");
        assert.deepEqual(page.calls.queries[0], expected);
        assert.equal(page.element("list").value, "https://one.example.test/\nhttps://two.example.test/\n");
    });
}

test("navigation: creating and editing lists open their own extension pages", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    page.element("list").value = "https://one.example.test/";
    page.element("createNewList").dispatch("click");
    assert.equal(new URL(page.calls.tabs[0].url).pathname, "/pages/lists/new.html");
    page.element("savedLists").options = [{ id: "2", text: "Start pages" }];
    page.element("editList").dispatch("click");
    const editor = new URL(page.calls.tabs[1].url);
    assert.equal(editor.pathname, "/pages/lists/edit.html");
    assert.equal(editor.searchParams.get("id"), "2");
});

test("navigation: the main interface can open as a separate popup window", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    page.element("openInPopup").dispatch("click");
    assert.equal(page.calls.windows[0].type, "popup");
    assert.equal(page.calls.windows[0].url, "popup.html?popup=true");
});

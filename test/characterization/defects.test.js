const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLegacyContext, pageContext, fixture } = require("./legacy-context");

// These passing tests demonstrate defects in the untouched legacy implementation.
// They are evidence for replacement work, not desired behaviour for the new code.

for (const [reason, name, lines, message] of [
    ["empty name", "", "https://one.example.test/\n", "You need to give a name for your list!"],
    ["single URL without newline", "Start", "https://one.example.test/", "No URLs given for the list!"],
]) {
    test(`legacy defect: editing with ${reason} deletes the original`, () => {
        const original = { object_description: "list_storage", list_id: 2, list_name: "Start", list_links: ["https://one.example.test/"] };
        const page = createLegacyContext({ href: "chrome-extension://baseline/pages/lists/edit.html?id=2&name=Start", raw: { settings: JSON.stringify({ ...fixture("default-settings.json"), disable_snapshots: 1 }), record: JSON.stringify(original), maxID: "2" } });
        page.load("app/js/utility.js");
        page.load("app/pages/lists/editlist.js");
        page.element("listName").value = name;
        page.element("list").value = lines;
        page.element("saveList").dispatch("click");
        assert.equal(page.localStorage.getItem("record"), null);
        assert.ok(page.calls.alerts.includes(message));
    });
}

test("legacy defect: clearing storage leaves records behind", () => {
    const page = pageContext({ disable_snapshots: 1 }, { a: "1", b: "2", c: "3", storage_snapshots: "{\"backups\":[]}" });
    page.run("clearLocalStorage()");
    assert.deepEqual(page.localStorage.dump(), { a: "1", c: "3", storage_snapshots: "{\"backups\":[]}" });
});

test("legacy defect: editing an old list moves maxID backwards", () => {
    const page = pageContext({}, { maxID: "10" });
    page.run(`saveList(2, ${JSON.stringify(fixture("export-v1.json").lists[0])}, false)`);
    assert.equal(page.localStorage.getItem("maxID"), "2");
    assert.equal(page.run("getNextAvailableID()"), 3);
});

test("legacy defect: quota failure is followed by a success alert", () => {
    const page = pageContext();
    page.localStorage.setItem = () => { throw new Error("Synthetic quota failure"); };
    page.run("saveList(2, {list_id: 2}, false)");
    assert.match(page.calls.alerts[0], /Unexpected error/);
    assert.equal(page.calls.alerts[1], "List saved successfully!");
});

test("legacy defect: invalid import JSON continues into an undefined property access", () => {
    const page = pageContext();
    page.load("app/pages/data-control/import.js");
    page.element("importTextArea").value = "{";
    assert.throws(() => page.element("importData").dispatch("click"), { name: "TypeError" });
    assert.equal(page.calls.alerts[0], "There is a problem with the data you have input.");
});

test("legacy defect: deleting a list leaves its worker mirror untouched", () => {
    const source = fixture("current-profile.json");
    const page = createLegacyContext({ raw: source.localStorage, extensionLocal: source.storageLocal });
    page.load("app/js/utility.js");
    page.run("removeList(2, true)");
    assert.equal(page.localStorage.getItem("11111111-1111-4111-8111-111111111111"), null);
    assert.deepEqual(page.local.lists, source.storageLocal.lists);
    assert.equal(page.calls.storageWrites.length, 0);
});

test("legacy defect: malformed data aborts mirror construction", () => {
    const page = pageContext({}, { malformed: "undefined" });
    assert.throws(() => page.run("saveListsToStorage()"), { name: "SyntaxError" });
});

test("legacy defect: comma-string settings prevent legacy utility initialization", () => {
    const source = fixture("pre-json-profile.json");
    const page = createLegacyContext({ raw: source.localStorage });
    assert.throws(() => page.load("app/js/utility.js"), { name: "SyntaxError" });
    assert.deepEqual(page.localStorage.dump(), source.localStorage);
});

test("legacy defect: startup searches call the missing getSetting helper", () => {
    const worker = createLegacyContext({ worker: true });
    worker.load("app/service-worker.js");
    assert.throws(() => worker.run("linksIteratorProcessURL('hello world', false, {non_url_handler: 'searchForString'})"), { name: "ReferenceError", message: "getSetting is not defined" });
});

test("legacy defect: the startup path does not apply automatic deduplication", async () => {
    const settings = { ...fixture("default-settings.json"), automatically_remove_duplicate_urls: 1, open_on_launch: "2" };
    const list = { list_id: 2, list_links: ["https://one.example.test/", "https://one.example.test/"] };
    const worker = createLegacyContext({ worker: true, extensionLocal: { userSettings: settings, lists: [list] } });
    worker.load("app/service-worker.js");
    await worker.run("browserStartup()");
    worker.drainTimers();
    assert.equal(worker.calls.tabs.length, 2);
});

test("legacy defect: empty immediate batches dereference a missing first entry", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    assert.throws(() => page.run("openList('   ')"), { name: "TypeError" });
});

test("legacy defect: a new list can be saved without a name", () => {
    const page = pageContext();
    page.load("app/pages/lists/newlist.js");
    page.element("list").value = "https://one.example.test/";
    page.element("listName").value = "";
    page.element("saveList").dispatch("click");
    assert.equal(page.local.lists[0].list_name, "");
});

test("legacy defect: FTP and browser-internal schemes acquire an HTTP prefix", () => {
    const page = pageContext();
    assert.equal(page.run("prependHttpIfNotExist('ftp://one.example.test/')"), "http://ftp://one.example.test/");
    assert.equal(page.run("prependHttpIfNotExist('chrome://settings')"), "http://chrome://settings");
});

test("legacy defect: search encoding leaves query separators and fragments active", () => {
    const page = pageContext();
    assert.equal(page.run("encodeSearchQuery('cats & dogs #news')"), "http://www.google.com/search?q=cats%20&%20dogs%20#news");
});

test("legacy defect: URL extraction's fallback does not accept localhost", () => {
    const page = pageContext();
    assert.equal(page.run("extractURLFromString('http://localhost:8080/path')"), "noextractionsuccess");
});

test("legacy defect: deferred loading decodes an encoded query value twice", () => {
    const destination = "https://one.example.test/?x=%26y%3Dz";
    const page = createLegacyContext({ href: `chrome-extension://baseline/delayedloading.html?url=${encodeURIComponent(destination)}` });
    page.load("app/js/utility.js");
    page.load("app/js/delayedloading.js");
    page.focusWindow();
    assert.deepEqual(page.calls.navigations, ["https://one.example.test/?x=&y=z"]);
});

test("legacy defect: delayed batches ignore the final-tab activation preference", () => {
    const page = pageContext({ new_tabs_active: 1 }, { linksToOpen: JSON.stringify({ list_links: ["https://one.example.test/", "https://two.example.test/"] }) });
    page.load("app/js/openingtabs.js");
    page.drainTimers();
    assert.deepEqual(page.calls.tabs.map(tab => tab.active), [false, false]);
    assert.equal(page.localStorage.getItem("linksToOpen"), null);
});

test("legacy defect: list names are interpolated into editor query strings without encoding", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    page.element("savedLists").options = [{ id: "2", text: "Research & notes" }];
    page.element("editList").dispatch("click");
    assert.equal(new URL(page.calls.tabs[0].url).searchParams.get("name"), "Research ");
});

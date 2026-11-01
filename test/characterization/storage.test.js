const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLegacyContext, pageContext, fixture } = require("./legacy-context");

test("settings: a fresh profile receives all legacy browser defaults", () => {
    const page = createLegacyContext();
    page.load("app/js/utility.js");
    page.run("createSettings()");
    assert.deepEqual(JSON.parse(page.localStorage.getItem("settings")), fixture("default-settings.json"));
});

test("lists: saving preserves content under a UUID key and creates the worker mirror", () => {
    const page = pageContext();
    const list = fixture("export-v1.json").lists[0];
    page.run(`saveList(2, ${JSON.stringify(list)}, false)`);
    const key = Object.keys(page.localStorage.dump()).find(name => name !== "settings" && name !== "maxID");
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(JSON.parse(page.localStorage.getItem(key)), list);
    assert.equal(page.localStorage.getItem("maxID"), "2");
    assert.deepEqual(page.local.lists, [list]);
});

test("exports: current profile retains all list/settings values and excludes transient records", () => {
    const source = fixture("current-profile.json");
    const page = createLegacyContext({ raw: source.localStorage });
    page.load("app/js/utility.js");
    page.load("app/pages/data-control/export.js");
    assert.deepEqual(JSON.parse(page.element("exportTextArea").value), fixture("export-v1.json"));
    assert.deepEqual(page.localStorage.dump(), source.localStorage);
});

test("exports: numeric-key JSON lists and older settings remain readable", () => {
    const source = fixture("numeric-profile.json");
    const page = createLegacyContext({ raw: source.localStorage });
    page.load("app/js/utility.js");
    page.load("app/pages/data-control/export.js");
    const output = JSON.parse(page.element("exportTextArea").value);
    assert.deepEqual(output.lists, fixture("export-v1.json").lists);
    assert.deepEqual(output.settings, JSON.parse(source.localStorage.settings));
    assert.equal(output.maxID, "12");
});

test("imports: a valid legacy export round-trips through an empty profile", () => {
    const page = createLegacyContext();
    const exported = fixture("export-v1.json");
    page.load("app/js/utility.js");
    page.load("app/pages/data-control/import.js");
    page.element("importTextArea").value = JSON.stringify(exported);
    page.element("importData").dispatch("click");
    assert.deepEqual(JSON.parse(page.localStorage.getItem("2")), exported.lists[0]);
    assert.deepEqual(JSON.parse(page.localStorage.getItem("7")), exported.lists[1]);
    page.load("app/pages/data-control/export.js");
    assert.deepEqual(JSON.parse(page.element("exportTextArea").value), exported);
});

test("snapshots: backups are nested JSON strings containing list/settings exports", () => {
    const source = fixture("current-profile.json");
    const page = createLegacyContext({ raw: source.localStorage });
    page.load("app/js/utility.js");
    page.run("snapshotLocalStorage()");
    const snapshots = JSON.parse(page.localStorage.getItem("storage_snapshots"));
    assert.equal(typeof snapshots.backups[1], "string");
    const backup = JSON.parse(snapshots.backups[1]);
    assert.deepEqual(backup.lists, fixture("export-v1.json").lists);
    assert.deepEqual(backup.settings, fixture("export-v1.json").settings);
    assert.equal(backup.maxID, "12");
    assert.equal(Number.isNaN(Date.parse(backup.snapshot_time)), false);
    assert.equal("previous_list_input" in backup, false);
});

test("snapshots: observed retention is five complete backups", () => {
    const page = pageContext();
    for (let index = 0; index < 7; index++) page.run("snapshotLocalStorage()");
    const backups = JSON.parse(page.localStorage.getItem("storage_snapshots")).backups;
    assert.equal(backups.length, 5);
    for (const backup of backups) assert.deepEqual(JSON.parse(backup).settings, fixture("default-settings.json"));
});

test("fixtures: profile snapshots contain raw string values and explicit synthetic provenance", () => {
    for (const name of ["current-profile.json", "numeric-profile.json", "pre-json-profile.json", "pre-marker-profile.json", "conflicting-mirrors.json", "mirror-only-profile.json", "damaged-profile.json"]) {
        const source = fixture(name);
        assert.equal(source._fixture.synthetic, true, name);
        assert.ok(source._fixture.sources.length > 0, name);
        for (const value of Object.values(source.localStorage)) assert.equal(typeof value, "string", name);
    }
});

test("fixtures: historical marker arrays were coerced into comma-separated strings", () => {
    const source = fixture("pre-json-profile.json");
    assert.equal(source.localStorage["1"], String(["listStorage", 1, "Start pages", "https://start.example.test/", "https://docs.example.test/"]));
    assert.equal(source.localStorage.settings, String(["settings", 0.3]));
    assert.equal(fixture("pre-marker-profile.json").localStorage["1"], String([1, "Start pages", "https://start.example.test/", "https://docs.example.test/"]));
});

test("fixtures: browser sync stores one serialized export under user_settings", () => {
    const source = fixture("current-profile.json");
    assert.equal(typeof source.storageSync.user_settings, "string");
    assert.deepEqual(JSON.parse(source.storageSync.user_settings), fixture("export-v1.json"));
});

test("fixtures: conflicting and mirror-only profiles retain independent source content", () => {
    const source = fixture("conflicting-mirrors.json");
    const localList = JSON.parse(source.localStorage["11111111-1111-4111-8111-111111111111"]);
    assert.notDeepEqual(localList.list_links, source.storageLocal.lists[0].list_links);
    assert.equal(source.storageLocal.lists[2].list_id, 10);
    assert.notEqual(JSON.parse(source.localStorage.settings).tab_creation_delay, source.storageLocal.userSettings.tab_creation_delay);
    const mirrorOnly = fixture("mirror-only-profile.json");
    assert.deepEqual(mirrorOnly.localStorage, {});
    assert.deepEqual(mirrorOnly.storageLocal.lists, fixture("export-v1.json").lists);
});

test("drafts: typed lines preserve content and trailing blank input", () => {
    const page = pageContext();
    page.load("app/js/main-interface.js");
    page.element("list").value = "https://draft.example.test/\r\nsearch phrase\n";
    page.element("list").dispatch("input");
    assert.deepEqual(JSON.parse(page.localStorage.getItem("previous_list_input")), ["https://draft.example.test/", "search phrase", ""]);
});

test("drafts: previous-input selection restores the saved lines", () => {
    const page = pageContext({ default_list_open: -2 }, { previous_list_input: JSON.stringify(["https://draft.example.test/", "search phrase"]) });
    page.load("app/js/main-interface.js");
    assert.equal(page.element("list").value, "https://draft.example.test/\nsearch phrase\n");
});

test("tools: extractor returns the first detected URL on each matching line", () => {
    const page = pageContext();
    page.load("app/pages/tools/extractor.js");
    page.element("extractFrom").value = "Read https://one.example.test/ now\nNothing here\nhttps://two.example.test/path";
    page.element("manualExtractButton").dispatch("click");
    assert.equal(page.element("extractTo").value, "https://one.example.test/\nhttps://two.example.test/path\n");
});

test("tools: reverse removes empty lines and reverses the remaining order", () => {
    const page = pageContext();
    page.load("app/pages/tools/reverse.js");
    page.element("reverseFrom").value = "first\n\nsecond\nthird";
    page.element("manualReverseButton").dispatch("click");
    assert.equal(page.element("reverseTo").value, "third\nsecond\nfirst\n");
});

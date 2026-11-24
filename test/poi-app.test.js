const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../public/assets/poi-app.js"), "utf8");

async function openPoiPage(id, details, tips) {
  const elements = new Map();
  const calls = { details: [], autocomplete: [] };
  const document = {
    getElementById(name) {
      if (!elements.has(name)) {
        elements.set(name, {
          hidden: true,
          textContent: "",
          children: [],
          classList: { add() {}, remove() {} },
          addEventListener() {},
          append(...children) { this.children.push(...children); },
          replaceChildren() { this.children = []; }
        });
      }
      return elements.get(name);
    },
    createElement() { return { textContent: "" }; }
  };
  const window = {
    location: { href: `https://example.test/poi?id=${id}`, search: `?id=${id}` },
    history: { replaceState() {} },
    loadAmap: async () => {},
    AMap: {
      plugin(_name, callback) { callback(); },
      PlaceSearch: class {
        getDetails(query, callback) {
          calls.details.push(query);
          callback(details.status, details.response);
        }
      },
      Autocomplete: class {
        constructor(options) { this.options = options; }
        search(keyword, callback) {
          calls.autocomplete.push({ keyword, city: this.options.city });
          callback(tips.status, tips.response);
        }
      },
      Map: class { addControl() {} },
      Marker: class {},
      Scale: class {}
    }
  };
  vm.runInNewContext(script, { document, window, URL, URLSearchParams });
  await new Promise(setImmediate);
  return { elements, calls };
}

test("entrance ID uses only an autocomplete tip with the same ID", async () => {
  const id = "B00155HXIQ";
  const tip = {
    id,
    name: "大华阳城花园(西南门)",
    address: "阳城路283弄1-95号大华阳城花园",
    district: "上海市静安区",
    location: { getLng: () => 121.423347, getLat: () => 31.283347 }
  };
  const { elements, calls } = await openPoiPage(id, { status: "no_data", response: {} }, { status: "complete", response: { tips: [tip] } });
  assert.deepEqual(calls.details, [id]);
  assert.deepEqual(calls.autocomplete, [{ keyword: "大华阳城花园西南门", city: "上海" }]);
  assert.equal(elements.get("result").hidden, false);
  assert.equal(elements.get("poi-name").textContent, tip.name);
  assert.match(elements.get("status").textContent, /仅展示基本信息/);
  assert.match(elements.get("poi-json").textContent, /121\.423347,31\.283347/);
});

test("a name match with another ID is rejected", async () => {
  const { elements } = await openPoiPage("B00155HXIQ", { status: "no_data", response: {} }, {
    status: "complete", response: { tips: [{ id: "B00155KAHZ", name: "大华阳城花园(西南门)" }] }
  });
  assert.equal(elements.get("result").hidden, true);
  assert.match(elements.get("status").textContent, /未找到对应的 POI/);
});

test("detail records retain the original lookup path", async () => {
  const id = "B0FFGH288B";
  const { elements, calls } = await openPoiPage(id, {
    status: "complete", response: { poiList: { pois: [{ id, name: "大华阳城花园" }] } }
  }, { status: "no_data", response: {} });
  assert.equal(calls.autocomplete.length, 0);
  assert.equal(elements.get("result").hidden, false);
  assert.equal(elements.get("status").textContent, "查询成功。");
});

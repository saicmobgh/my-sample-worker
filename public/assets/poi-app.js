(function () {
  "use strict";

  const form = document.getElementById("poi-form");
  const input = document.getElementById("poi-id");
  const button = document.getElementById("search-button");
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  const name = document.getElementById("poi-name");
  const fields = document.getElementById("poi-fields");
  const raw = document.getElementById("poi-json");
  const mapSection = document.getElementById("map-section");
  const mapStatus = document.getElementById("map-status");
  let map;
  let marker;
  let searchNumber = 0;
  let amapPromise;
  // Some entrance POIs are absent from PlaceSearch details but appear in Autocomplete.
  // Match the returned ID before showing a result; never use a name match alone.
  const fallbackHints = Object.freeze({
    B00155HXIQ: { keyword: "大华阳城花园西南门", city: "上海" }
  });

  function loadSearchPlugin() {
    if (!amapPromise) {
      amapPromise = window.loadAmap("AMap.PlaceSearch,AMap.Autocomplete,AMap.Scale").catch(function (error) {
        amapPromise = null;
        throw error;
      });
    }
    return amapPromise;
  }

  function coordinates(location) {
    if (location && typeof location.getLng === "function" && typeof location.getLat === "function") {
      location = [location.getLng(), location.getLat()];
    } else if (typeof location === "string") {
      location = location.split(",");
    } else if (location && !Array.isArray(location) && typeof location === "object") {
      location = [location.lng, location.lat];
    }
    if (!Array.isArray(location) || location.length !== 2) return null;
    const lng = Number(location[0]);
    const lat = Number(location[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return [lng, lat];
  }

  function display(value) {
    if (value === undefined || value === null || value === "") return "";
    if (value && typeof value.getLng === "function") {
      const point = coordinates(value);
      return point ? point.join(",") : "";
    }
    if (Array.isArray(value)) return value.map(display).filter(Boolean).join("、");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function addField(label, value) {
    const formatted = display(value);
    if (!formatted) return;
    const term = document.createElement("dt");
    term.textContent = label;
    const definition = document.createElement("dd");
    definition.textContent = formatted;
    fields.append(term, definition);
  }

  function showMap(point, title) {
    mapSection.hidden = false;
    try {
      if (!map) {
        map = new window.AMap.Map("poi-map", { zoom: 16, center: point, resizeEnable: true });
        map.addControl(new window.AMap.Scale());
        marker = new window.AMap.Marker({ map: map, position: point, title: title });
      } else {
        map.setZoomAndCenter(16, point);
        marker.setPosition(point);
        marker.setTitle(title);
        if (typeof map.resize === "function") map.resize();
      }
      mapStatus.textContent = "地图已定位到该 POI。";
    } catch (error) {
      mapStatus.textContent = "地图暂时无法加载：" + error.message;
    }
  }

  function showPoi(poi, responseBody, source) {
    result.hidden = false;
    name.textContent = display(poi.name) || "未命名 POI";
    fields.replaceChildren();
    addField("数据来源", source === "tip" ? "高德地点提示（基本信息）" : "高德地点详情");
    addField("POI ID", poi.id);
    addField("经纬度（经度,纬度）", poi.location);
    addField("地址", poi.address);
    addField("类型", poi.type);
    addField("类型编码", poi.typecode);
    addField("省份", poi.pname);
    addField("城市", poi.cityname);
    addField("区县", poi.adname || poi.district);
    addField("电话", poi.tel || poi.business && poi.business.tel);
    addField("网址", poi.website);
    addField("邮编", poi.postcode);
    addField("导航入口经纬度", poi.entr_location || poi.navi && poi.navi.entr_location);
    addField("导航出口经纬度", poi.exit_location || poi.navi && poi.navi.exit_location);
    addField("营业时间", poi.business && (poi.business.opentime_today || poi.business.opentime_week) || poi.open_time);
    addField("评分", poi.business && poi.business.rating || poi.biz_ext && poi.biz_ext.rating);
    addField("人均消费", poi.business && poi.business.cost || poi.biz_ext && poi.biz_ext.cost);
    if (poi.navi) {
      addField("导航引导点 ID", poi.navi.navi_poiid);
    }
    const seen = new WeakSet();
    raw.textContent = JSON.stringify(responseBody, function (_key, value) {
      if (value && typeof value.getLng === "function") return display(value);
      if (value && typeof value === "object") {
        if (seen.has(value)) return "[循环引用]";
        seen.add(value);
      }
      return value;
    }, 2);
    const point = coordinates(poi.location);
    mapSection.hidden = !point;
    if (point) showMap(point, name.textContent);
  }

  function getDetails(id) {
    return new Promise(function (resolve, reject) {
      window.AMap.plugin("AMap.PlaceSearch", function () {
        try {
          const placeSearch = new window.AMap.PlaceSearch({ extensions: "all" });
          placeSearch.getDetails(id, function (queryStatus, response) {
            const pois = response && response.poiList && response.poiList.pois;
            if (queryStatus === "complete" && Array.isArray(pois) && pois.length) {
              resolve({ poi: pois[0], body: response, source: "details" });
            } else if (queryStatus === "no_data" || queryStatus === "complete") {
              resolve(null);
            } else {
              reject(new Error(response && response.info && response.info !== "OK" ? response.info : "高德地点详情查询失败。"));
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function getAutocompleteTip(id, hint) {
    return new Promise(function (resolve, reject) {
      window.AMap.plugin("AMap.Autocomplete", function () {
        try {
          const autocomplete = new window.AMap.Autocomplete({ city: hint.city, datatype: "all" });
          autocomplete.search(hint.keyword, function (queryStatus, response) {
            const tips = response && response.tips;
            if (queryStatus === "complete" && Array.isArray(tips)) {
              const poi = tips.find(function (tip) { return tip.id === id; });
              resolve(poi ? { poi: poi, body: { source: "AMap.Autocomplete", tip: poi }, source: "tip" } : null);
            } else if (queryStatus === "no_data") {
              resolve(null);
            } else {
              reject(new Error(response && response.info && response.info !== "OK" ? response.info : "高德地点提示查询失败。"));
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async function search(id) {
    const currentSearch = ++searchNumber;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      status.textContent = "请输入有效的 POI ID（字母、数字、下划线或短横线）。";
      status.classList.add("error");
      result.hidden = true;
      button.disabled = false;
      return;
    }
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = "正在查询 POI…";
    result.hidden = true;
    try {
      await loadSearchPlugin();
      if (currentSearch !== searchNumber) return;
      let match = await getDetails(id);
      if (currentSearch !== searchNumber) return;
      if (!match && fallbackHints[id]) {
        status.textContent = "详情接口无数据，正在核对高德地点提示…";
        match = await getAutocompleteTip(id, fallbackHints[id]);
      }
      if (currentSearch !== searchNumber) return;
      if (!match) throw new Error("未找到对应的 POI，请检查 ID。");
      showPoi(match.poi, match.body, match.source);
      status.textContent = match.source === "tip"
        ? "已按 POI ID 从高德地点提示中找到该地点。详情接口无数据，仅展示基本信息；地图坐标不能视为导航入口坐标。"
        : "查询成功。";
      const url = new URL(window.location.href);
      url.searchParams.set("id", id);
      window.history.replaceState(null, "", url);
    } catch (error) {
      if (currentSearch !== searchNumber) return;
      result.hidden = true;
      status.classList.add("error");
      status.textContent = "查询失败：" + error.message;
    } finally {
      if (currentSearch === searchNumber) button.disabled = false;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    search(input.value.trim());
  });

  const initialId = new URLSearchParams(window.location.search).get("id");
  if (initialId) {
    input.value = initialId;
    search(initialId.trim());
  }
})();

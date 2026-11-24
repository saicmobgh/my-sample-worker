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

  function loadSearchPlugin() {
    if (!amapPromise) {
      amapPromise = window.loadAmap("AMap.PlaceSearch,AMap.Scale").catch(function (error) {
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

  function showPoi(poi, responseBody) {
    result.hidden = false;
    name.textContent = display(poi.name) || "未命名 POI";
    fields.replaceChildren();
    addField("POI ID", poi.id);
    addField("经纬度（经度,纬度）", poi.location);
    addField("地址", poi.address);
    addField("类型", poi.type);
    addField("类型编码", poi.typecode);
    addField("省份", poi.pname);
    addField("城市", poi.cityname);
    addField("区县", poi.adname);
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
      const body = await new Promise(function (resolve, reject) {
        window.AMap.plugin("AMap.PlaceSearch", function () {
          try {
            const placeSearch = new window.AMap.PlaceSearch({ extensions: "all" });
            placeSearch.getDetails(id, function (queryStatus, response) {
              if (queryStatus === "complete" && response) {
                resolve(response);
              } else {
                reject(new Error(response && response.info && response.info !== "OK" ? response.info : "未找到对应的 POI，请检查 ID。"));
              }
            });
          } catch (error) {
            reject(error);
          }
        });
      });
      if (currentSearch !== searchNumber) return;
      const pois = body.poiList && body.poiList.pois;
      if (!Array.isArray(pois) || pois.length === 0) throw new Error("未找到对应的 POI，请检查 ID。");
      showPoi(pois[0], body);
      status.textContent = "查询成功。";
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

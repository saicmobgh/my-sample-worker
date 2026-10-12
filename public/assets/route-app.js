(function () {
  var PLUGINS = [
    "AMap.Scale",
    "AMap.Geolocation",
    "AMap.Driving",
    "AMap.Walking",
    "AMap.Riding",
    "AMap.Transfer",
    "AMap.Autocomplete",
    "AMap.PlaceSearch",
    "AMap.Geocoder"
  ].join(",");

  var MARKER_STYLES = {
    origin: {
      label: "起",
      icon: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png",
      labelClass: "marker-label marker-label-blue"
    },
    destination: {
      label: "终",
      icon: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png",
      labelClass: "marker-label marker-label-red"
    },
    waypoint: {
      label: "经",
      icon: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png",
      labelClass: "marker-label marker-label-blue"
    }
  };

  var KEY_ERRORS = {
    INVALID_USER_KEY: "高德 Key 无效。请确认 Worker 变量 amap_key",
    INVALID_USER_SCODE: "高德安全密钥校验未通过。请确认 Worker 变量 amap_secret，以及域名白名单",
    INVALID_USER_DOMAIN: "当前域名不在高德 Key 白名单内",
    USERKEY_PLAT_NOMATCH: "当前 Key 未开通 Web端(JS API) 或 Web服务，无法规划路线",
    INSUFFICIENT_PRIVILEGES: "当前 Key 未开通路径规划或地点搜索",
    SERVICE_NOT_AVAILABLE: "当前 Key 未开通这项服务，请在高德控制台开通路径规划和搜索",
    DAILY_QUERY_OVER_LIMIT: "高德接口今日配额已用完"
  };

  var state = {
    mapApp: null,
    mode: "driving",
    planner: null,
    pick: null,
    origin: null,
    destination: null,
    waypoints: [],
    waypointSeq: 0,
    suggestToken: 0,
    planning: false,
    autoComplete: null,
    placeSearch: null,
    geocoder: null
  };

  var originInput;
  var destinationInput;
  var originSuggest;
  var destinationSuggest;
  var drivingOptions;
  var waypointBox;
  var policySelect;
  var summaryBox;
  var stepsBox;
  var statusBox;
  var planButton;

  function asText(value) {
    if (value === undefined || value === null || Array.isArray(value)) {
      return "";
    }

    return String(value).trim();
  }

  function plainText(value) {
    return asText(value)
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u3000/g, " ")
      .replace(/，/g, ",")
      .replace(/：/g, ":")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .trim();
  }

  function readLngLat(location) {
    if (!location || Array.isArray(location)) {
      return null;
    }

    if (typeof location.getLng === "function") {
      return [Number(location.getLng()), Number(location.getLat())];
    }

    if (typeof location.lng === "number" && typeof location.lat === "number") {
      return [location.lng, location.lat];
    }

    if (typeof location === "string") {
      return parseCoordinateInput(location);
    }

    return null;
  }

  function parseCoordinateInput(text) {
    var raw = normalizeText(text);
    var match;
    var pair;
    var leftover;

    if (!raw) {
      return null;
    }

    match = raw.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);

    if (!match) {
      return null;
    }

    leftover = raw
      .replace(/经度|纬度|longitude|latitude|lng|lon|lat/gi, "")
      .replace(/[-+]?\d+(?:\.\d+)?/g, "")
      .replace(/[,:：=\s()°]/g, "");

    if (leftover) {
      return null;
    }

    pair = normalizePair(match[1], match[2]);
    return pair;
  }

  function normalizePair(first, second) {
    var x = Number(first);
    var y = Number(second);
    var lng = x;
    var lat = y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    if (Math.abs(x) > 90 && Math.abs(y) <= 90) {
      lng = x;
      lat = y;
    } else if (Math.abs(y) > 90 && Math.abs(x) <= 90) {
      lng = y;
      lat = x;
    } else if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      lng = x;
      lat = y;
    } else {
      return null;
    }

    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return null;
    }

    return [lng, lat];
  }

  function formatCoordinate(pair) {
    return Number(pair[0]).toFixed(6) + "," + Number(pair[1]).toFixed(6);
  }

  function formatDistance(meters) {
    var value = Number(meters);

    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    if (value < 1000) {
      return Math.round(value) + " 米";
    }

    return (value / 1000).toFixed(value >= 10000 ? 0 : 1) + " 公里";
  }

  function formatDuration(seconds) {
    var value = Number(seconds);
    var minutes;
    var hours;
    var rest;

    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    minutes = Math.round(value / 60);

    if (minutes < 1) {
      return "不足 1 分钟";
    }

    if (minutes < 60) {
      return minutes + " 分钟";
    }

    hours = Math.floor(minutes / 60);
    rest = minutes % 60;
    return rest ? hours + " 小时 " + rest + " 分钟" : hours + " 小时";
  }

  function describeFailure(result, fallback) {
    var info = "";

    if (typeof result === "string") {
      info = result;
    } else if (result && (result.info || result.message)) {
      info = String(result.info || result.message);
    }

    if (KEY_ERRORS[info]) {
      return KEY_ERRORS[info];
    }

    if (info && info !== "OK" && info !== "COMPLETE") {
      return fallback + "（" + info + "）";
    }

    return fallback;
  }

  function setStatus(text, tone) {
    statusBox.textContent = text || "";
    statusBox.className = "message" + (tone ? " " + tone : "");
  }

  function setBusy(busy) {
    planButton.disabled = busy;
    planButton.textContent = busy ? "规划中..." : "规划";
  }

  function endpointField(kind) {
    if (kind === "origin") {
      return {
        kind: "origin",
        label: "起点",
        input: originInput,
        suggest: originSuggest,
        getPoint: function () {
          return state.origin;
        },
        setPoint: function (point) {
          state.origin = point;
        }
      };
    }

    return {
      kind: "destination",
      label: "终点",
      input: destinationInput,
      suggest: destinationSuggest,
      getPoint: function () {
        return state.destination;
      },
      setPoint: function (point) {
        state.destination = point;
      }
    };
  }

  function waypointField(row) {
    return {
      kind: "waypoint",
      id: row.id,
      label: "途经点",
      input: row.input,
      suggest: row.suggest,
      getPoint: function () {
        return row.point;
      },
      setPoint: function (point) {
        row.point = point;
      }
    };
  }

  function activeFields() {
    var fields = [endpointField("origin"), endpointField("destination")];

    if (state.mode === "driving") {
      state.waypoints.forEach(function (row) {
        if (row.input.value.trim()) {
          fields.push(waypointField(row));
        }
      });
    }

    return fields;
  }

  function hideSuggest(field) {
    field.suggest.hidden = true;
    field.suggest.textContent = "";
  }

  function closeSuggests() {
    hideSuggest(endpointField("origin"));
    hideSuggest(endpointField("destination"));
    state.waypoints.forEach(function (row) {
      hideSuggest(waypointField(row));
    });
  }

  function renderSuggest(field, choices) {
    field.suggest.textContent = "";

    if (!choices.length) {
      field.suggest.hidden = true;
      return;
    }

    choices.slice(0, 8).forEach(function (choice) {
      var button = document.createElement("button");
      var title = document.createElement("span");
      var meta = document.createElement("span");

      button.type = "button";
      title.className = "suggest-title";
      title.textContent = choice.label;
      button.appendChild(title);

      if (choice.detail) {
        meta.className = "suggest-meta";
        meta.textContent = choice.detail;
        button.appendChild(meta);
      }

      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        selectChoice(field, choice);
      });
      field.suggest.appendChild(button);
    });

    field.suggest.hidden = false;
  }

  function selectChoice(field, choice) {
    hideSuggest(field);
    ensureLocation(choice).then(function (point) {
      applyPoint(field, point);
      setStatus("已选择" + field.label + "：" + point.label, "ok");
    }).catch(function (error) {
      setStatus(error.message || "这个地点没有坐标", "error");
    });
  }

  function applyPoint(field, point) {
    field.input.value = point.label;
    field.setPoint(point);
    showPreview(field, point);
    state.mapApp.setCenter([point.lng, point.lat]);

    if (state.mapApp.map.getZoom() < 14) {
      state.mapApp.map.setZoom(15);
    }
  }

  function markerKey(field) {
    return field.kind === "waypoint" ? "waypoint-" + field.id : field.kind;
  }

  function showPreview(field, point) {
    var key = markerKey(field);
    var style = MARKER_STYLES[field.kind] || MARKER_STYLES.waypoint;

    if (state.preview && state.preview[key]) {
      state.mapApp.removeMarker(state.preview[key]);
    }

    state.preview = state.preview || {};
    state.preview[key] = state.mapApp.addMarker([point.lng, point.lat], {
      label: style.label,
      iconSrc: style.icon,
      labelClass: style.labelClass
    });
  }

  function clearPreview() {
    state.mapApp.clearMarkers();
    state.preview = {};
  }

  function choiceFromTip(tip) {
    var location = readLngLat(tip.location);
    var district = asText(tip.district);
    var address = asText(tip.address);

    return {
      id: asText(tip.id),
      label: asText(tip.name),
      detail: district + address,
      lng: location ? location[0] : null,
      lat: location ? location[1] : null,
      city: ""
    };
  }

  function choiceFromPoi(poi) {
    var location = readLngLat(poi.location);
    var city = asText(poi.cityname || poi.city);

    if (!location || !asText(poi.name || poi.formattedAddress)) {
      return null;
    }

    return {
      id: asText(poi.id),
      label: asText(poi.name || poi.formattedAddress),
      detail: [asText(poi.pname), city, asText(poi.adname), asText(poi.address)].filter(Boolean).join(""),
      lng: location[0],
      lat: location[1],
      city: city.replace(/市$/, "")
    };
  }

  function searchTips(keyword) {
    return new Promise(function (resolve, reject) {
      AMap.plugin("AMap.Autocomplete", function () {
        if (!state.autoComplete) {
          state.autoComplete = new AMap.Autocomplete({
            city: "全国",
            datatype: "all"
          });
        }

        state.autoComplete.search(keyword, function (status, result) {
          var tips;

          if (status !== "complete" || !result || !result.tips) {
            reject(new Error(describeFailure(result, "地点搜索失败")));
            return;
          }

          tips = result.tips.map(choiceFromTip).filter(function (choice) {
            return choice.label;
          });
          resolve(tips);
        });
      });
    });
  }

  function searchPois(keyword) {
    return new Promise(function (resolve, reject) {
      AMap.plugin("AMap.PlaceSearch", function () {
        if (!state.placeSearch) {
          state.placeSearch = new AMap.PlaceSearch({
            pageSize: 8,
            pageIndex: 1,
            city: "全国",
            citylimit: false
          });
        }

        state.placeSearch.search(keyword, function (status, result) {
          var pois = result && result.poiList && result.poiList.pois;
          var choices;

          if (status !== "complete" || !pois || !pois.length) {
            reject(new Error(describeFailure(result, "没有找到地点：" + keyword)));
            return;
          }

          choices = pois.map(choiceFromPoi).filter(Boolean);

          if (!choices.length) {
            reject(new Error("没有找到地点：" + keyword));
            return;
          }

          resolve(choices);
        });
      });
    });
  }

  function geocode(keyword) {
    return new Promise(function (resolve, reject) {
      AMap.plugin("AMap.Geocoder", function () {
        if (!state.geocoder) {
          state.geocoder = new AMap.Geocoder();
        }

        state.geocoder.getLocation(keyword, function (status, result) {
          var geocodes = result && result.geocodes;
          var choices;

          if (status !== "complete" || !geocodes || !geocodes.length) {
            reject(new Error(describeFailure(result, "没有找到地点：" + keyword)));
            return;
          }

          choices = geocodes.map(function (item) {
            return choiceFromPoi({
              location: item.location,
              name: item.formattedAddress || keyword,
              formattedAddress: item.formattedAddress,
              city: item.addressComponent && item.addressComponent.city,
              address: item.formattedAddress
            });
          }).filter(Boolean);

          if (!choices.length) {
            reject(new Error("没有找到地点：" + keyword));
            return;
          }

          resolve(choices);
        });
      });
    });
  }

  function isKeyError(error) {
    var message = error && error.message ? error.message : "";
    return message.indexOf("Key") !== -1 || message.indexOf("配额") !== -1 || message.indexOf("白名单") !== -1;
  }

  function searchPlaces(keyword) {
    return searchPois(keyword).catch(function (error) {
      if (isKeyError(error)) {
        throw error;
      }

      return geocode(keyword);
    });
  }

  function ensureLocation(choice) {
    if (Number.isFinite(choice.lng) && Number.isFinite(choice.lat)) {
      return Promise.resolve({
        label: choice.label,
        lng: choice.lng,
        lat: choice.lat,
        city: choice.city || ""
      });
    }

    if (!choice.id) {
      return searchPlaces(choice.label).then(function (choices) {
        if (!choices.length) {
          throw new Error("这个地点没有坐标");
        }

        return {
          label: choice.label || choices[0].label,
          lng: choices[0].lng,
          lat: choices[0].lat,
          city: choices[0].city || ""
        };
      });
    }

    return new Promise(function (resolve, reject) {
      AMap.plugin("AMap.PlaceSearch", function () {
        var placeSearch = new AMap.PlaceSearch({ extensions: "base" });

        placeSearch.getDetails(choice.id, function (status, result) {
          var poi = result && result.poiList && result.poiList.pois && result.poiList.pois[0];
          var point = poi && choiceFromPoi(poi);

          if (status !== "complete" || !point) {
            reject(new Error(describeFailure(result, "这个地点没有坐标")));
            return;
          }

          resolve({
            label: choice.label || point.label,
            lng: point.lng,
            lat: point.lat,
            city: point.city || ""
          });
        });
      });
    });
  }

  function samePoint(point, text) {
    var parsed;

    if (!point) {
      return false;
    }

    if (point.label === text) {
      return true;
    }

    parsed = parseCoordinateInput(text);

    if (!parsed) {
      return false;
    }

    return Math.abs(point.lng - parsed[0]) < 0.000001 && Math.abs(point.lat - parsed[1]) < 0.000001;
  }

  function resolveField(field) {
    var text = field.input.value.trim();
    var cached = field.getPoint();
    var coordinate;

    if (!text) {
      return Promise.reject(new Error("请填写" + field.label));
    }

    if (samePoint(cached, text)) {
      return Promise.resolve(cached);
    }

    coordinate = parseCoordinateInput(text);

    if (coordinate) {
      return Promise.resolve({
        label: formatCoordinate(coordinate),
        lng: coordinate[0],
        lat: coordinate[1],
        city: ""
      });
    }

    return searchPlaces(text).then(function (choices) {
      var exact = choices.filter(function (choice) {
        return choice.label === text || choice.label.replace(/\s/g, "") === text.replace(/\s/g, "");
      });
      var picked = exact.length === 1 ? exact[0] : (choices.length === 1 ? choices[0] : null);
      var error;

      if (picked) {
        return {
          label: picked.label,
          lng: picked.lng,
          lat: picked.lat,
          city: picked.city || ""
        };
      }

      renderSuggest(field, choices);
      error = new Error("找到多个地点，请选择" + field.label);
      error.ambiguous = true;
      throw error;
    });
  }

  function scheduleSuggest(field) {
    var token;

    field.setPoint(null);
    window.clearTimeout(field.timer);
    token = ++state.suggestToken;
    field.timer = window.setTimeout(function () {
      var keyword = field.input.value.trim();

      if (keyword.length < 2 || parseCoordinateInput(keyword)) {
        hideSuggest(field);
        return;
      }

      searchTips(keyword).then(function (choices) {
        if (token !== state.suggestToken || field.input.value.trim() !== keyword) {
          return;
        }

        renderSuggest(field, choices);
      }).catch(function () {
        if (token === state.suggestToken) {
          hideSuggest(field);
        }
      });
    }, 250);
  }

  function bindSuggest(field) {
    field.input.addEventListener("input", function () {
      scheduleSuggest(field);
    });
    field.input.addEventListener("keydown", function (event) {
      var firstChoice;

      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      firstChoice = field.suggest.querySelector("button");

      if (!field.suggest.hidden && firstChoice) {
        firstChoice.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        return;
      }

      plan();
    });
    field.input.addEventListener("focus", function () {
      if (field.suggest.children.length) {
        field.suggest.hidden = false;
      }
    });
  }

  function clearPick() {
    state.pick = null;
    originInput.classList.remove("picking");
    destinationInput.classList.remove("picking");
    state.waypoints.forEach(function (row) {
      row.input.classList.remove("picking");
    });
    document.querySelectorAll(".pick-btn").forEach(function (button) {
      button.classList.remove("btn-primary");
      button.classList.add("btn-default");
    });

    if (state.mapApp) {
      state.mapApp.map.setDefaultCursor("default");
    }
  }

  function startPick(field) {
    var pickingSame = state.pick && state.pick.kind === field.kind && state.pick.id === field.id;

    clearPick();

    if (pickingSame) {
      setStatus("", "");
      return;
    }

    state.pick = { kind: field.kind, id: field.id };
    field.input.classList.add("picking");
    document.querySelectorAll('.pick-btn[data-pick="' + field.kind + '"]').forEach(function (button) {
      if (!field.id || button.getAttribute("data-id") === String(field.id)) {
        button.classList.add("btn-primary");
        button.classList.remove("btn-default");
      }
    });
    state.mapApp.map.setDefaultCursor("crosshair");
    setStatus("请在地图上点击选择" + field.label, "ok");
  }

  function fieldFromPick() {
    if (!state.pick) {
      return null;
    }

    if (state.pick.kind === "waypoint") {
      var row = state.waypoints.filter(function (item) {
        return item.id === state.pick.id;
      })[0];
      return row ? waypointField(row) : null;
    }

    return endpointField(state.pick.kind);
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-row [data-mode]").forEach(function (button) {
      var active = button.getAttribute("data-mode") === mode;
      button.classList.toggle("btn-primary", active);
      button.classList.toggle("btn-default", !active);
    });
    drivingOptions.hidden = mode !== "driving";
    disposePlanner();
    summaryBox.textContent = "";
    stepsBox.textContent = "";
  }

  function addWaypointRow() {
    var row;
    var field;

    if (state.waypoints.length >= 5) {
      setStatus("最多添加 5 个途经点", "warn");
      return;
    }

    state.waypointSeq += 1;
    row = {
      id: state.waypointSeq,
      point: null,
      input: document.createElement("input"),
      suggest: document.createElement("div")
    };
    row.element = document.createElement("div");
    row.element.className = "field-row waypoint-row";

    var wrap = document.createElement("div");
    wrap.className = "suggest-wrap";
    row.input.className = "form-control";
    row.input.placeholder = "途经点：经度,纬度 或地点";
    row.input.autocomplete = "off";
    row.input.spellcheck = false;
    row.suggest.className = "suggest-list";
    row.suggest.hidden = true;
    wrap.appendChild(row.input);
    wrap.appendChild(row.suggest);

    var pickButton = document.createElement("button");
    pickButton.type = "button";
    pickButton.className = "btn btn-default pick-btn";
    pickButton.textContent = "选点";
    pickButton.setAttribute("data-pick", "waypoint");
    pickButton.setAttribute("data-id", String(row.id));

    var removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-default";
    removeButton.textContent = "删除";

    row.element.appendChild(wrap);
    row.element.appendChild(pickButton);
    row.element.appendChild(removeButton);
    waypointBox.appendChild(row.element);
    state.waypoints.push(row);

    field = waypointField(row);
    bindSuggest(field);
    pickButton.addEventListener("click", function () {
      startPick(field);
    });
    removeButton.addEventListener("click", function () {
      removeWaypoint(row.id);
    });
  }

  function removeWaypoint(id) {
    state.waypoints = state.waypoints.filter(function (row) {
      if (row.id !== id) {
        return true;
      }

      if (state.preview && state.preview["waypoint-" + id]) {
        state.mapApp.removeMarker(state.preview["waypoint-" + id]);
        delete state.preview["waypoint-" + id];
      }

      row.element.remove();
      return false;
    });

    if (state.pick && state.pick.kind === "waypoint" && state.pick.id === id) {
      clearPick();
    }
  }

  function disposePlanner() {
    if (!state.planner) {
      return;
    }

    try {
      state.planner.clear();
    } catch (error) {
      // The previous route instance can already be detached from the map.
    }

    state.planner = null;
  }

  function toLngLat(point) {
    return new AMap.LngLat(point.lng, point.lat);
  }

  function stepFrom(item) {
    return {
      instruction: plainText(item.instruction || item.action || ""),
      distance: item.distance,
      time: item.time || item.duration
    };
  }

  function normalizePath(result) {
    var route = result && result.routes && result.routes[0];
    var segments;

    if (!route) {
      throw new Error(describeFailure(result, "没有找到路线"));
    }

    segments = route.steps || route.rides || [];

    return {
      distance: route.distance,
      time: route.time,
      tolls: Number(route.tolls) || 0,
      count: result.routes.length,
      steps: segments.map(stepFrom).filter(function (step) {
        return step.instruction;
      })
    };
  }

  function transitInstruction(segment) {
    var transit = segment && segment.transit;
    var line = transit && transit.lines && transit.lines[0];
    var onName = transit && transit.on_station && asText(transit.on_station.name);
    var offName = transit && transit.off_station && asText(transit.off_station.name);
    var text = plainText(segment && segment.instruction);

    if (text) {
      return text;
    }

    if (line && asText(line.name)) {
      return "乘坐" + asText(line.name) + (onName ? "，从" + onName + "上车" : "") + (offName ? "，到" + offName + "下车" : "");
    }

    return "步行";
  }

  function normalizeTransit(result, city) {
    var plan = result && result.plans && result.plans[0];
    var segments;
    var distance;

    if (!plan) {
      throw new Error(describeFailure(result, "没有找到公交方案"));
    }

    segments = plan.segments || [];
    distance = segments.reduce(function (total, segment) {
      return total + (Number(segment.distance) || 0);
    }, 0);

    return {
      distance: plan.distance || distance,
      time: plan.time,
      cost: Number(plan.cost) || 0,
      city: city,
      count: result.plans.length,
      steps: segments.map(function (segment) {
        return {
          instruction: transitInstruction(segment),
          distance: segment.distance,
          time: segment.time
        };
      }).filter(function (step) {
        return step.instruction;
      })
    };
  }

  function searchWith(createPlanner, origin, destination, extra, emptyMessage) {
    return new Promise(function (resolve, reject) {
      var planner = createPlanner();
      var callback = function (status, result) {
        if (status === "complete") {
          resolve(result);
          return;
        }

        reject(new Error(describeFailure(result, emptyMessage)));
      };

      state.planner = planner;

      if (extra) {
        planner.search(origin, destination, extra, callback);
      } else {
        planner.search(origin, destination, callback);
      }
    });
  }

  function searchDriving(origin, destination, waypoints) {
    var policyName = policySelect.value;
    var extra = waypoints.length ? { waypoints: waypoints } : null;

    return searchWith(function () {
      var options = {
        map: state.mapApp.map,
        autoFitView: true,
        hideMarkers: true,
        showTraffic: policyName === "REAL_TRAFFIC"
      };
      var policy = window.AMap.DrivingPolicy && AMap.DrivingPolicy[policyName];

      if (policy) {
        options.policy = policy;
      }

      return new AMap.Driving(options);
    }, origin, destination, extra, "没有找到驾车路线").then(normalizePath);
  }

  function searchWalking(origin, destination) {
    return searchWith(function () {
      return new AMap.Walking({
        map: state.mapApp.map,
        autoFitView: true,
        hideMarkers: true
      });
    }, origin, destination, null, "没有找到步行路线").then(normalizePath);
  }

  function searchRiding(origin, destination) {
    return searchWith(function () {
      return new AMap.Riding({
        map: state.mapApp.map,
        autoFitView: true,
        hideMarkers: true
      });
    }, origin, destination, null, "没有找到骑行路线").then(normalizePath);
  }

  function cityOf(lnglat, fallbackCity) {
    if (fallbackCity) {
      return Promise.resolve(fallbackCity);
    }

    return new Promise(function (resolve) {
      AMap.plugin("AMap.Geocoder", function () {
        if (!state.geocoder) {
          state.geocoder = new AMap.Geocoder();
        }

        state.geocoder.getAddress(lnglat, function (status, result) {
          var component = result && result.regeocode && result.regeocode.addressComponent;
          var city = component && asText(component.city);

          if (!city && component) {
            city = asText(component.province);
          }

          resolve(city.replace(/市$/, ""));
        });
      });
    });
  }

  function searchTransit(origin, destination, city) {
    return searchWith(function () {
      var options = {
        map: state.mapApp.map,
        city: city,
        autoFitView: true,
        hideMarkers: true
      };

      if (window.AMap.TransferPolicy) {
        options.policy = AMap.TransferPolicy.LEAST_TIME;
      }

      return new AMap.Transfer(options);
    }, origin, destination, null, "没有找到公交方案").then(function (result) {
      return normalizeTransit(result, city);
    });
  }

  function pointsAreSame(first, second) {
    return Math.abs(first.lng - second.lng) < 0.00001 && Math.abs(first.lat - second.lat) < 0.00001;
  }

  function runRoute(points) {
    var origin = toLngLat(points.origin);
    var destination = toLngLat(points.destination);
    var waypoints;

    disposePlanner();
    clearPreview();
    points.origin && showPreview(endpointField("origin"), points.origin);
    showPreview(endpointField("destination"), points.destination);

    if (state.mode === "driving") {
      waypoints = points.waypoints.map(toLngLat);
      return searchDriving(origin, destination, waypoints);
    }

    if (state.mode === "walking") {
      return searchWalking(origin, destination);
    }

    if (state.mode === "riding") {
      return searchRiding(origin, destination);
    }

    return cityOf(origin, points.origin.city).then(function (city) {
      if (!city) {
        throw new Error("无法识别起点城市，公交规划需要城市信息");
      }

      return searchTransit(origin, destination, city);
    });
  }

  function renderResult(result) {
    var bits = [];
    var modeLabel = { driving: "驾车", walking: "步行", riding: "骑行", transit: "公交" }[state.mode];

    summaryBox.textContent = "";
    stepsBox.textContent = "";

    bits.push(modeLabel);
    if (result.city) {
      bits.push(result.city);
    }
    if (formatDistance(result.distance)) {
      bits.push(formatDistance(result.distance));
    }
    if (formatDuration(result.time)) {
      bits.push(formatDuration(result.time));
    }
    if (result.tolls) {
      bits.push("过路费 " + result.tolls + " 元");
    }
    if (result.cost) {
      bits.push("票价约 " + result.cost + " 元");
    }
    if (result.count > 1) {
      bits.push("共 " + result.count + " 条方案，地图显示第 1 条");
    }

    summaryBox.textContent = bits.join(" · ");
    result.steps.forEach(function (step) {
      var item = document.createElement("li");
      var text = document.createElement("span");
      var meta = document.createElement("span");
      var metaText = [formatDistance(step.distance), formatDuration(step.time)].filter(Boolean).join(" · ");

      text.className = "step-text";
      text.textContent = step.instruction;
      item.appendChild(text);

      if (metaText) {
        meta.className = "step-meta";
        meta.textContent = metaText;
        item.appendChild(meta);
      }

      stepsBox.appendChild(item);
    });
  }

  function plan() {
    var resolved = {};

    if (state.planning || !state.mapApp) {
      return;
    }

    closeSuggests();
    clearPick();
    state.planning = true;
    setBusy(true);
    setStatus("正在规划...", "");

    activeFields().reduce(function (chain, field) {
      return chain.then(function () {
        return resolveField(field).then(function (point) {
          field.input.value = point.label;
          field.setPoint(point);
          showPreview(field, point);

          if (field.kind === "origin") {
            resolved.origin = point;
          } else if (field.kind === "destination") {
            resolved.destination = point;
          } else {
            resolved.waypoints = resolved.waypoints || [];
            resolved.waypoints.push(point);
          }
        });
      });
    }, Promise.resolve()).then(function () {
      resolved.waypoints = resolved.waypoints || [];

      if (pointsAreSame(resolved.origin, resolved.destination)) {
        throw new Error("起点和终点相同");
      }

      return runRoute(resolved);
    }).then(function (result) {
      renderResult(result);
      setStatus("路线已更新", "ok");
    }).catch(function (error) {
      var tone = error && error.ambiguous ? "warn" : "error";
      setStatus(error && error.message ? error.message : "规划失败", tone);
    }).then(function () {
      state.planning = false;
      setBusy(false);
    });
  }

  function clearRoute() {
    disposePlanner();
    clearPreview();
    clearPick();
    closeSuggests();
    state.origin = null;
    state.destination = null;
    originInput.value = "";
    destinationInput.value = "";
    state.waypoints.slice().forEach(function (row) {
      removeWaypoint(row.id);
    });
    summaryBox.textContent = "";
    stepsBox.textContent = "";
    setStatus("", "");
  }

  function bindStaticEvents() {
    document.querySelectorAll(".mode-row [data-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.getAttribute("data-mode"));
      });
    });

    document.querySelectorAll('.pick-btn[data-pick="origin"], .pick-btn[data-pick="destination"]').forEach(function (button) {
      button.addEventListener("click", function () {
        startPick(endpointField(button.getAttribute("data-pick")));
      });
    });

    bindSuggest(endpointField("origin"));
    bindSuggest(endpointField("destination"));

    document.getElementById("add-waypoint").addEventListener("click", addWaypointRow);
    document.getElementById("plan").addEventListener("click", plan);
    document.getElementById("clear").addEventListener("click", clearRoute);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        clearPick();
        closeSuggests();
      }
    });

    document.addEventListener("click", function (event) {
      if (!event.target.closest(".suggest-wrap")) {
        closeSuggests();
      }
    });

    state.mapApp.onMapClick(function (coordinate) {
      var field = fieldFromPick();

      if (!field) {
        return;
      }

      applyPoint(field, {
        label: formatCoordinate(coordinate),
        lng: coordinate[0],
        lat: coordinate[1],
        city: ""
      });
      clearPick();
      setStatus("已选择" + field.label, "ok");
    });
  }

  function boot() {
    originInput = document.getElementById("origin");
    destinationInput = document.getElementById("destination");
    originSuggest = document.getElementById("origin-suggest");
    destinationSuggest = document.getElementById("destination-suggest");
    drivingOptions = document.getElementById("driving-options");
    waypointBox = document.getElementById("waypoints");
    policySelect = document.getElementById("policy");
    summaryBox = document.getElementById("summary");
    stepsBox = document.getElementById("steps");
    statusBox = document.getElementById("status");
    planButton = document.getElementById("plan");

    AMap.plugin(["AMap.Scale", "AMap.Geolocation"], function () {
      try {
        state.mapApp = new window.TrackVisionMapBase({
          containerId: "map",
          center: [121.484011, 31.240391],
          zoom: 12
        });
        bindStaticEvents();
        setStatus("填写起点和终点后规划路线", "");
      } catch (error) {
        setStatus(error.message || "地图初始化失败", "error");
      }
    });
  }

  function start() {
    window.loadAmap(PLUGINS).then(boot).catch(function (error) {
      statusBox = document.getElementById("status");
      if (statusBox) {
        setStatus(error.message || "地图加载失败", "error");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

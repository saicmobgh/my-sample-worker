(function (window) {
  function loadAmap(plugins) {
    return fetch("/api/nav/config", { cache: "no-store" }).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (body) {
        if (!response.ok) {
          throw new Error(body.error || "地图配置接口返回 " + response.status);
        }

        if (!body.key) {
          throw new Error("地图 Key 为空。请在 Worker 控制台配置 amap_key");
        }

        window._AMapSecurityConfig = {
          serviceHost: window.location.origin + "/_AMapService"
        };

        if (window.AMap) {
          return body.key;
        }

        return new Promise(function (resolve, reject) {
          var script = document.createElement("script");

          script.src = "https://webapi.amap.com/maps?v=1.4.15&key=" + encodeURIComponent(body.key) + "&plugin=" + plugins;
          script.async = true;
          script.onload = function () {
            resolve(body.key);
          };
          script.onerror = function () {
            reject(new Error("高德地图脚本加载失败"));
          };
          document.head.appendChild(script);
        });
      });
    });
  }

  window.loadAmap = loadAmap;
})(window);

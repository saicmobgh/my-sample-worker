(function (window) {
  var DEFAULT_CENTER = [121.484011, 31.240391];

  function createCoordinate(value) {
    if (Array.isArray(value) && value.length >= 2) {
      var lng = Number(value[0]);
      var lat = Number(value[1]);

      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }

    if (typeof value === "string") {
      return createCoordinate(value.split(","));
    }

    return null;
  }

  class TrackVisionMapBase {
    constructor(options) {
      var settings = options || {};

      this.map = new AMap.Map(settings.containerId || "map", {
        resizeEnable: true,
        center: settings.center || DEFAULT_CENTER,
        zoom: settings.zoom || 15
      });

      this.map.setZooms(settings.zoomRange || [1, 25]);
      this.markers = [];
      this.polyline = null;

      this.addScaleControl();

      if (settings.enableGeolocation !== false) {
        this.addGeolocationControl();
      }
    }

    addScaleControl() {
      this.map.addControl(new AMap.Scale({ visible: true }));
    }

    addGeolocationControl() {
      var mapInstance = this.map;

      AMap.plugin("AMap.Geolocation", function () {
        var geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 5000,
          buttonPosition: "RB",
          buttonOffset: new AMap.Pixel(10, 20),
          zoomToAccuracy: true
        });

        mapInstance.addControl(geolocation);
      });
    }

    onMapClick(handler) {
      this.map.on("click", function (event) {
        if (typeof handler !== "function") {
          return;
        }

        handler([event.lnglat.getLng(), event.lnglat.getLat()], event);
      });
    }

    setCenter(coordinate) {
      var point = createCoordinate(coordinate);

      if (point) {
        this.map.setCenter(point);
      }
    }

    createMarkerContent(label, options) {
      var settings = options || {};
      var content = document.createElement("div");
      var markerImg = document.createElement("img");

      markerImg.className = "markerlnglat";
      markerImg.src = settings.iconSrc || "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png";
      content.appendChild(markerImg);

      if (label) {
        var markerSpan = document.createElement("span");
        markerSpan.className = settings.labelClass || "marker-label marker-label-red";
        markerSpan.textContent = label;
        content.appendChild(markerSpan);
      }

      return content;
    }

    addMarker(coordinate, options) {
      var point = createCoordinate(coordinate);
      var settings = options || {};

      if (!point) {
        return null;
      }

      var marker = new AMap.Marker({
        offset: new AMap.Pixel(0, 0),
        position: point,
        anchor: "bottom-center"
      });

      marker.setContent(this.createMarkerContent(settings.label, settings));
      marker.setMap(this.map);
      marker.on("click", this.removeMarker.bind(this, marker));

      this.markers.push(marker);

      return marker;
    }

    removeMarker(marker) {
      marker.setMap(null);
      this.markers = this.markers.filter(function (item) {
        return item !== marker;
      });
    }

    clearMarkers() {
      this.markers.forEach(function (marker) {
        marker.setMap(null);
      });

      this.markers = [];
    }

    drawPolyline(points, options) {
      var settings = options || {};
      var path = (points || []).map(createCoordinate).filter(Boolean);

      if (!path.length) {
        return null;
      }

      this.clearPolyline();

      this.polyline = new AMap.Polyline({
        map: this.map,
        path: path,
        showDir: settings.showDir !== false,
        strokeColor: settings.strokeColor || "#82F",
        strokeWeight: settings.strokeWeight || 4
      });

      return this.polyline;
    }

    clearPolyline() {
      if (!this.polyline) {
        return;
      }

      this.map.remove(this.polyline);
      this.polyline = null;
    }

    clearAll() {
      this.clearMarkers();
      this.clearPolyline();
    }

    fitView(overlays) {
      var activeOverlays = overlays && overlays.length ? overlays.filter(Boolean) : this.getOverlays();

      if (activeOverlays.length) {
        this.map.setFitView(activeOverlays, false, [40, 40, 40, 40]);
      }
    }

    getOverlays() {
      var overlays = this.markers.slice();

      if (this.polyline) {
        overlays.push(this.polyline);
      }

      return overlays;
    }
  }

  window.TrackVisionMapBase = TrackVisionMapBase;
})(window);

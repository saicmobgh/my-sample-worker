(function () {
  var RED_MARKER_ICON = "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-red.png";

  function normalizeInput(text) {
    return String(text || "")
      .replace(/\u3000/g, " ")
      .replace(/，/g, ",")
      .replace(/；/g, ";")
      .replace(/：/g, ":")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/\r/g, "\n");
  }

  function isLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  function isLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  function toCoordinate(lng, lat) {
    var lngValue = Number(lng);
    var latValue = Number(lat);

    if (!isLongitude(lngValue) || !isLatitude(latValue)) {
      return null;
    }

    return [lngValue, latValue];
  }

  function collectMatches(text, pattern, mapper) {
    var matches = [];
    var match;

    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      var coordinate = mapper(match);

      if (coordinate) {
        matches.push({
          coordinate: coordinate,
          start: match.index,
          end: pattern.lastIndex
        });
      }
    }

    return matches;
  }

  function overlaps(range, usedRanges) {
    return usedRanges.some(function (usedRange) {
      return range.start < usedRange.end && range.end > usedRange.start;
    });
  }

  function coordinateKey(coordinate) {
    return coordinate[0] + "," + coordinate[1];
  }

  function containsCoordinateSequence(container, target) {
    var startIndex;
    var offset;

    if (target.length > container.length) {
      return false;
    }

    for (startIndex = 0; startIndex <= container.length - target.length; startIndex += 1) {
      var matched = true;

      for (offset = 0; offset < target.length; offset += 1) {
        if (coordinateKey(container[startIndex + offset]) !== coordinateKey(target[offset])) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return true;
      }
    }

    return false;
  }

  function extractGenericCoordinatePairs(input) {
    var text = normalizeInput(input);
    var usedRanges = [];
    var collected = [];

    var extractors = [
      function extractLabeledLngLat(source) {
        return collectMatches(
          source,
          /(?:lng|lon|longitude|经度)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)\D{0,24}(?:lat|latitude|纬度)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/gi,
          function (match) {
            return toCoordinate(match[1], match[2]);
          }
        );
      },
      function extractLabeledLatLng(source) {
        return collectMatches(
          source,
          /(?:lat|latitude|纬度)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)\D{0,24}(?:lng|lon|longitude|经度)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/gi,
          function (match) {
            return toCoordinate(match[2], match[1]);
          }
        );
      },
      function extractSingleValueArrayPairs(source) {
        var values = [];
        var matches = [];
        var pattern = /\[\s*["']?([-+]?\d+(?:\.\d+)?)["']?\s*\]/g;
        var match;

        while ((match = pattern.exec(source)) !== null) {
          values.push({
            value: Number(match[1]),
            start: match.index,
            end: pattern.lastIndex
          });
        }

        for (var index = 0; index + 1 < values.length; index += 2) {
          var coordinate = toCoordinate(values[index].value, values[index + 1].value);

          if (coordinate) {
            matches.push({
              coordinate: coordinate,
              start: values[index].start,
              end: values[index + 1].end
            });
          }
        }

        return matches;
      },
      function extractCommaPairs(source) {
        return collectMatches(
          source,
          /([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)/g,
          function (match) {
            return toCoordinate(match[1], match[2]);
          }
        );
      },
      function extractSpacePairs(source) {
        return collectMatches(
          source,
          /(?:point\s*\(\s*|^|[\s;|[(])([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)(?=\s*(?:\)|\]|\}|,|;|\||\n|$))/gi,
          function (match) {
            return toCoordinate(match[1], match[2]);
          }
        );
      }
    ];

    extractors.forEach(function (extractor) {
      extractor(text).forEach(function (item) {
        if (overlaps(item, usedRanges)) {
          return;
        }

        usedRanges.push({ start: item.start, end: item.end });
        collected.push(item);
      });
    });

    return collected
      .sort(function (left, right) {
        return left.start - right.start;
      })
      .map(function (item) {
        return item.coordinate;
      });
  }

  function extractPolylineCoordinatePairs(input) {
    var text = normalizeInput(input);
    var pattern = /["']?polyline["']?\s*:\s*"([^"]+)"/gi;
    var sequences = [];
    var match;

    while ((match = pattern.exec(text)) !== null) {
      var coordinates = extractGenericCoordinatePairs(match[1]);

      if (coordinates.length) {
        sequences.push({
          start: match.index,
          coordinates: coordinates
        });
      }
    }

    if (!sequences.length) {
      return [];
    }

    var selected = [];

    sequences
      .slice()
      .sort(function (left, right) {
        return right.coordinates.length - left.coordinates.length || left.start - right.start;
      })
      .forEach(function (candidate) {
        var duplicated = selected.some(function (accepted) {
          return containsCoordinateSequence(accepted.coordinates, candidate.coordinates);
        });

        if (!duplicated) {
          selected.push(candidate);
        }
      });

    return selected
      .sort(function (left, right) {
        return left.start - right.start;
      })
      .reduce(function (all, item) {
        return all.concat(item.coordinates);
      }, []);
  }

  function compactConsecutiveCoordinates(coordinates) {
    return (coordinates || []).filter(function (coordinate, index) {
      if (index === 0) {
        return true;
      }

      return coordinateKey(coordinate) !== coordinateKey(coordinates[index - 1]);
    });
  }

  function extractCoordinatePairs(input) {
    var polylineCoordinates = extractPolylineCoordinatePairs(input);

    if (polylineCoordinates.length) {
      return compactConsecutiveCoordinates(polylineCoordinates);
    }

    return compactConsecutiveCoordinates(extractGenericCoordinatePairs(input));
  }

  function formatCoordinate(coordinate) {
    return coordinate[0] + "," + coordinate[1];
  }

  function appendCoordinate(textarea, text) {
    var current = textarea.value.trim();
    textarea.value = current ? current + ";\n" + text : text + ";\n";
  }

  function getFirstCoordinate(text) {
    var coordinates = extractCoordinatePairs(text);
    return coordinates.length ? coordinates[0] : null;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mapBase = new window.TrackVisionMapBase({
      containerId: "map",
      center: [121.484011, 31.240391],
      zoom: 15
    });

    var lonlatInput = document.getElementById("lonlat");
    var clickLonlatInput = document.getElementById("click-lonlat");
    var lonlatsTextarea = document.getElementById("lonlats");
    var locateButton = document.getElementById("locate");
    var markButton = document.getElementById("mark");
    var markPointsButton = document.getElementById("mark2");
    var drawLineButton = document.getElementById("mark3");
    var cleanButton = document.getElementById("clean");

    function markCoordinate(coordinate) {
      return mapBase.addMarker(coordinate, {
        iconSrc: RED_MARKER_ICON,
        labelClass: "marker-label marker-label-red",
        label: formatCoordinate(coordinate)
      });
    }

    mapBase.onMapClick(function (coordinate) {
      var formatted = formatCoordinate(coordinate);
      clickLonlatInput.value = formatted;
      appendCoordinate(lonlatsTextarea, formatted);
    });

    locateButton.addEventListener("click", function () {
      var coordinate = getFirstCoordinate(lonlatInput.value);

      if (!coordinate) {
        return;
      }

      mapBase.setCenter(coordinate);
      markCoordinate(coordinate);
    });

    markButton.addEventListener("click", function () {
      var coordinate = getFirstCoordinate(clickLonlatInput.value);

      if (coordinate) {
        markCoordinate(coordinate);
      }
    });

    markPointsButton.addEventListener("click", function () {
      mapBase.clearAll();

      var coordinates = extractCoordinatePairs(lonlatsTextarea.value);
      coordinates.forEach(function (coordinate) {
        markCoordinate(coordinate);
      });

      mapBase.fitView();
    });

    drawLineButton.addEventListener("click", function () {
      var coordinates = extractCoordinatePairs(lonlatsTextarea.value);

      if (!coordinates.length) {
        return;
      }

      mapBase.setCenter(coordinates[Math.floor(coordinates.length / 2)]);
      mapBase.drawPolyline(coordinates, {
        strokeColor: "#82F",
        strokeWeight: 4,
        showDir: true
      });
      mapBase.fitView([mapBase.polyline]);
    });

    cleanButton.addEventListener("click", function () {
      mapBase.clearAll();
    });
  });
})();

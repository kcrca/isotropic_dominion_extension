// plugin popupready from http://plugins.jquery.com/project/popupready
jQuery.fn.popupready = function(onready, url, name, features, replace) {
  var popup = window.open(url, name, features, replace);
  if (onready) {
    setTimeout(poll, 10);
  }
  function poll() {
    if (jQuery("body *", popup.document).length == 0) {
      setTimeout(poll, 10);
    } else {
      onready(popup);
    }
  }

  return popup;
};
jQuery.popupready = jQuery.fn.popupready;

log = function() {
  var n = 0;
  var levels = {
    Fine: n++,
    Debug: n++,
    Info: n++,
    Config:n++,
    Warning:n++,
    Severe: n++,
    Off: n++
  };
  var levelNameToNum = {};
  var levelNumToName = {};

  var handlers = {
    window: {
      publish: function(area, levelNum, level, when, message) {
        var logRecord = {
          area: area,
          level: level,
          when: when,
          message: message
        };

        if (this.windowReady) {
          this.sendLog(logRecord);
        } else {
          if (!this.pending) {
            this.pending = [];
            var self = this;
            $.popupready(function(popup) {
              $.pm({target: popup, type: "logOptions", data: self});
              self.consumePending(popup);
            }, "logWindow.html", "Log");
          }
          this.pending.push(logRecord);
        }
      },
      consumePending: function(popup) {
        this.popup = popup;
        this.windowReady = true;
        while (this.pending.length > 0) {
          var logRecord = this.pending.shift();
          this.sendLog(logRecord);
        }
      },
      sendLog: function(logRecord) {
        $.pm({
          target: this.popup,
          type: "logRecord",
          data: logRecord
        });
      }
    }
  };

  function areaDefaults(properties) {
    if (properties) {
      infoDefaults = properties;
    }
    return infoDefaults;
  }

  function area(areaName, properties) {
    if (!areaName) {
      return areaDefaults(properties);
    }

    var origProperties = info[areaName];
    if (properties) {
      info[areaName] = properties;
    } else if (!origProperties) {
      info[areaName] = $.extend({}, infoDefaults);
    }
    return info[areaName];
  }

  for (var levelName in levels) {
    var levelNum = levels[levelName];

    levelNumToName[levelNum] = levelName;

    var ch = levelName.charAt(0);
    levelNameToNum[levelName] = levelNum;
    levelNameToNum[ch.toUpperCase()] = levelNum;
    levelNameToNum[ch.toLowerCase()] = levelNum;
  }

  var info = {};
  var infoDefaults = {level: 'Info', handlers: [handlers.window]};

  function toLevelNum(level) {
    if (typeof(level) == 'string') {
      var num = parseInt(level);
      if (!isNaN(num)) {
        return num;
      }
      return levelNameToNum[level.charAt(0)];
    }
    return level;
  }

  function log(area, levelSpec, message) {
    var levelNum = toLevelNum(levelSpec);
    var areaInfo = $.extend({}, infoDefaults, info[area]);
    var areaLevelNum = toLevelNum(areaInfo.level);
    if (levelNum < areaLevelNum) return false;

    var handlers = areaInfo.handlers;

    var levelName = levelNumToName[levelNum];
    levelName = levelName || "Unknown";
    var when = new Date();
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].publish(area, levelNum, levelName, when, message);
    }
    return true;
  }

  var logObject = {
    log: log,
    level: area,
    levels: levels,
    areaDefaults: areaDefaults,
    area: area,
    handlers: handlers
  };

  // Add functions for levels, (log.error(), log.info(), ...).
  for (levelName in levels) {
    logObject[levelName.toLowerCase()] = function(area, message) {
      return log(area, levels[levelName], message);
    }
  }

  return logObject;
}();

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
    FINE: n++,
    DEBUG: n++,
    INFO: n++,
    CONFIG:n++,
    WARNING:n++,
    SEVERE: n++,
    OFF: n++
  };

  var handlers = {
    window: {
      publish: function(area, level, levelName, when, message) {
        if (!this.logTable) {
          if (!this.pending) {
            this.pending = [];
            var self = this;
            $.popupready(function(popup) {
              self.buildLogTable(popup);
              self.consumePending();
            }, "logWindow.html", "Log");
          }
          this.pending.push([area, level, levelName, when, message]);
          return;
        }

        var row = $('<tr/>').addClass('log.' + levelName);

        row.append($('<td/>', {text: area}));
        row.append($('<td/>', {text: levelName}));
        row.append($('<td/>', {text: when}));
        row.append($('<td/>', {text: message}));

        this.logTable.append(row);
      },
      buildLogTable: function(popup) {
        var logWindow = $(popup);

        var logRegion = $('<div/>', {
          'class': 'log.region',
          append: $('<table/>', {
            'class': 'log.table',
            append: $('<tr/>', {
              append: $('<th>Area</th><th>Level</th></th><th>When</th></th><th>Message</th>')
            })
          })
        });
        logWindow.append(logRegion);

        this.logTable = $(logWindow).find('#log.table');

      },
      consumePending: function() {
        while (this.pending.length > 0) {
          var params = this.pending.shift();
          this.publish(params[0], params[1], params[2], params[3], params[4])
        }
      }
    }
  };

  function areaDefaults(properties) {
    var origDefaults = infoDefaults;
    if (properties) {
      infoDefaults = properties;
    }
    return origDefaults;
  }

  function area(areaName, properties) {
    if (!areaName) {
      return areaDefaults(properties);
    }

    var origProperties = info[areaName];
    if (properties) {
      info[areaName] = properties;
    }
    return origProperties;
  }

  for (var levelName in levels) {
    if (isNaN(parseInt(levelName))) {
      var levelNum = levels[levelName];
      levels[levelNum] = levelName;
    }
  }

  var info = {};
  var infoDefaults = {level: levels.INFO, handlers: [handlers.window]};

  function toLevelNum(level) {
    if (typeof(level) == 'string') {
      var num = parseInt(level);
      if (!isNaN(num)) {
        return num;
      }
      return levels[level];
    }
    return level;
  }

  function log(area, level, message) {
    level = toLevelNum(level);
    var areaInfo = $.extend({}, infoDefaults, info[area]);
    if (areaInfo.levelNum == undefined) {
      areaInfo.levelNum = toLevelNum(areaInfo.level);
    }
    if (level < areaInfo.levelNum) return false;

    var handlers = areaInfo.handlers;

    var levelName = levels[level];
    var when = new Date();
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].publish(area, level, levelName, when, message);
    }
    return true;
  }

  var logObject = {
    log: log,
    levels: levels,
    areaDefaults: areaDefaults,
    area: area,
    handlers: handlers
  };

  // Add functions for levels, (log.error(), log.info(), ...).
  for (levelName in levels) {
    // Check to see if this is a name key or a number key
    if (isNaN(parseInt(levelName))) {
      logObject[levelName.toLowerCase()] = function(area, message) {
        return log(area, levels[levelName], message);
      }
    }
  }

  return logObject;
}();

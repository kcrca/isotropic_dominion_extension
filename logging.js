// plugin from http://plugins.jquery.com/project/popupready
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
  //noinspection JSUnusedGlobalSymbols
  var levels = {
    Fine: n++,
    Debug: n++,
    Info: n++,
    Config:n++,
    Warning:n++,
    Severe: n++,
    Alert: n++,
    Off: n++
  };
  var levelNameToNum = {};
  var levelNumToName = {};

  function handlerConfig(properties, override) {
    override = override != undefined ? override : false;
    if (!this.settings) {
      this.settings = {};
    }
    if (override) {
      this.settings = $.extend({}, properties);
    } else {
      $.extend(this.settings, properties);
    }
  }

  var handlers = {
    div: {
      config: handlerConfig,
      settings: {
        idPrefix: 'log',
        classPrefix: 'log',
        insertDiv: function(div) {
          $(document.body).append(div);
        }
      },
      idPrefix: function (props) {
        return (props ? props : this.settings).idPrefix;
      },
      classPrefix: function (props) {
        return (props ? props : this.settings).classPrefix;
      },
      publish: function(area, levelNum, level, when, message) {
        this.ensureDiv();
        var clsPrefix = this.classPrefix();

        var levelClass = clsPrefix + '-level-' + level;
        var areaClass = clsPrefix + '-area-' + area;
        var row = $('<tr/>').addClass(levelClass).addClass(areaClass);
        row.append($('<td class="' + clsPrefix + '-area"/>').text(area));
        row.append($('<td class="' + clsPrefix + '-level"/>').text(level));
        row.append($('<td class="' + clsPrefix + '-when"/>').text(when));
        row.append($('<td class="' + clsPrefix + '-message"/>').html(message));
        this.tableBody.append(row);
      },
      ensureDiv: function() {
        if (this.tableBody) return this.tableBody;

        var idPrefix = this.idPrefix();
        var classPrefix = this.classPrefix();

        function setup(node, suffix) {
          node.addClass(classPrefix + '-' + suffix);
          node.attr('id', idPrefix + '-' + suffix);
          return node;
        }

        var div = setup($('<div/>'), 'div');
        var table = setup($('<table/>'), 'table');
        var header = setup($('<tr/>'), 'header');
        header.append($('<th/>').text('Area'));
        header.append($('<th/>').text('Level'));
        header.append($('<th/>').text('When'));
        header.append($('<th/>').text('Message'));
        div.append(table);
        table.append(header);
        this.settings.insertDiv(div);
        this.tableBody = div.find('table > tbody');
      }
    },
    window: {
      config: handlerConfig,
      settings: {
        title: 'Log Messages',
        css: 'logWindow.css'
      },
      publish: function(area, levelNum, level, when, message) {
        var logRecord = {
          area: area,
          levelNum: levelNum,
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
              $.pm({target: popup, type: "logOptions", data: self.settings});
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
    },
    console:  {
      config: handlerConfig,
      settings: {
        prefix: ''
      },
      publish: function(area, levelNum, level, when, message) {
        var prefix = this.prefix;
        if (!prefix) prefix = '';
        if (prefix.length > 0) prefix += ':';
        message = textMessage(message);
        console.log(prefix + area + ':' + level + ':' + when + ':' + message);
      },
      alert: function(area, levelNum, level, when, message) {
        message = textMessage(message);
        alert("Area: " + area + "\n" + "Level: " + level + "\n" + "When: " +
            when + "\n" + "Message: " + message + "\n");
      }
    }
  };

  function textMessage(message) {
    // If it's HTML, extract the text part
    return $('<span>' + message + '</span>').text();
  }

  // purposefully making copy so we aren't sharing an object with the user
  function mergeOrReplace(orig, properties, replace) {
    var base = (replace ? {} : orig);
    return $.extend(base, properties);
  }

  function areaDefaults(properties, replace) {
    if (properties) {
      mergeOrReplace(infoDefaults, properties, replace);
    }
    // return a copy
    return $.extend({}, infoDefaults);
  }

  function area(areaName, properties, replace) {
    if (!areaName) {
      return areaDefaults(properties, replace);
    }

    if (properties) {
      mergeOrReplace(info[areaName], properties, replace);
    }
    // return a copy
    return $.extend({}, info[areaName]);
  }

  function defaultTimeFormat(when) {
    return when.toLocaleTimeString();
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
  var infoDefaults = {
    level: 'Info',
    alertLevel: 'Alert',
    handlers: [handlers.window],
    toTimeString: defaultTimeFormat
  };

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

    var alertLevelNum = toLevelNum(areaInfo.alertLevel);

    var handlers = areaInfo.handlers;

    var levelName = levelNumToName[levelNum];
    levelName = levelName || "Unknown";
    var when = areaInfo.toTimeString(new Date());
    for (var i = 0; i < handlers.length; i++) {
      var handler = handlers[i];
      handler.publish(area, levelNum, levelName, when, message);
      if (levelNum >= alertLevelNum && handler.alert) {
        handler.alert(area, levelNum, levelName, when, message);
      }
    }
    return true;
  }

  for (var handlerName in handlers) {
    handlers[handlerName].name = handlerName;
  }

  var logObject = {
    log: log,
    level: area,
    alert: alert,
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

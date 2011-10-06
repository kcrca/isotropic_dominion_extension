//!! Take this out of the namespace
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

(function($) {
  $.jog = $.fn.jog = function(method) {
    if (!method) {
      return logObject.jog();
    }

    var thing = logObject[method];
    if (thing) {
      if (typeof(thing) == 'function') {
        return thing.apply(this, Array.prototype.slice.call(arguments, 1));
      } else {
        return thing;
      }
    } else {
      return logObject.jog.apply(this, arguments);
    }
  };

  // Make levels actual objects so ==, <=, etc might operate? At least be consistent about if it's a number
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

  var handlerNum = 0;

  function Handler(name) {
    this.name = name;

    var timePart = new Date().getTime();
    var randomPart = Math.random().toString(25);
    this._id = name + ':' + timePart + ':' + randomPart + ':' + handlerNum++;

    this.config = function(properties, override) {
      override = override != undefined ? override : false;
      if (!this.settings) {
        this.settings = {};
      }
      if (override) {
        this.settings = $.extend({}, properties);
      } else {
        $.extend(this.settings, properties);
      }
    };

    this.toString = function() {
      return this._id;
    }
  }

  function newHandler(name, properties) {
    var handler = new Handler(name);
    if (properties) {
      $.extend(handler, properties);
    }
    return handler;
  }

  function defaultInsertHtml(top) {
    $(document.body).append(top);
  }

  var definedHandlers = {
    html: newHandler("html", {
      settings: {
        idPrefix: 'jog',
        classPrefix: 'jog',
        htmlId: 'jog-html',
        insertHtml: defaultInsertHtml
      },
      idPrefix: function (props) {
        return (props ? props : this.settings).idPrefix;
      },
      classPrefix: function (props) {
        return (props ? props : this.settings).classPrefix;
      },
      publish: function(area, levelNum, level, when, message) {
        this.ensureHtml();
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
      ensureHtml: function() {
        if (this.tableBody) return this.tableBody;

        var top;
        if (this.settings.htmlId) {
          top = $('#' + this.settings.htmlId);
        }
        if (!top || top.length == 0) {
          top = setup($('<div/>'), 'html');
          if (this.settings.htmlId)
            top.attr('id', this.settings.htmlId);
          this.settings.insertHtml(top);
        }
        // Check to make sure we have someplace to put this thing
        if ($('#' + this.settings.htmlId).length == 0) {
          return;
        }

        var idPrefix = this.idPrefix();
        var classPrefix = this.classPrefix();

        function setup(node, suffix) {
          node.addClass(classPrefix + '-' + suffix);
          node.attr('id', idPrefix + '-' + suffix);
          return node;
        }

        var table = setup($('<table/>'), 'table');
        var header = setup($('<tr/>'), 'header');
        header.append($('<th/>').text('Area'));
        header.append($('<th/>').text('Level'));
        header.append($('<th/>').text('When'));
        header.append($('<th/>').text('Message'));

        top.append(table);
        table.append(header);
        this.tableBody = top.find('table > tbody');
      }
    }),
    window: newHandler("window", {
      settings: {
        title: 'Log Messages',
        css: 'jog.css'
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
            }, "jogPopup.html", "Log");
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
    }),
    console:  newHandler("console", {
      settings: {
        prefix: ''
      },
      publish: function(area, levelNum, level, when, message) {
        var prefix = this.prefix;
        if (!prefix) prefix = '';
        if (prefix.length > 0) prefix += ':';
        message = messageText(message);
        console.log(prefix + area + ':' + level + ':' + when + ':' + message);
      },
      alert: function(area, levelNum, level, when, message) {
        message = messageText(message);
        alert("Area: " + area + "\n" + "Level: " + level + "\n" + "When: " +
            when + "\n" + "Message: " + message + "\n");
      }
    })
  };

  function messageText(message) {
    // If it's HTML, extract the text part
    return $('<span>' + message + '</span>').text();
  }

  function defaultTimeFormat(when) {
    return when.toLocaleTimeString();
  }

  for (var levelName in levels) {
    var levelNum = levels[levelName];

    levelNumToName[levelNum] = levelName;

    var ch = levelName.charAt(0);
    levelNameToNum[levelName] = levelNum;
    levelNameToNum[levelName.toUpperCase()] = levelNum;
    levelNameToNum[levelName.toLowerCase()] = levelNum;
    levelNameToNum[ch.toUpperCase()] = levelNum;
    levelNameToNum[ch.toLowerCase()] = levelNum;
  }

  var areas = {};
  var areaDefaults = new Area('');
  areaDefaults.level(levels.Info);
  areaDefaults.alertLevel(levels.Alert);
  areaDefaults.addHandlers(definedHandlers.html);
  areaDefaults.toTimeString = defaultTimeFormat;

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

  function jog(area) {
    if (!area)
      return areaDefaults;

    var areaInfo = areas[area];
    if (!areaInfo) {
      areaInfo = new Area(area);
      areas[area] = areaInfo;
    }
    return areaInfo;
  }

  function Area(name) {
    this.name = name;
    this._handlers = {};

    this.log = function(levelSpec, message) {
      var levelNum = toLevelNum(levelSpec);
      var areaInfo = $.extend(true, {}, areaDefaults, this);
      if (levelNum < areaInfo._level) return false;

      var alertLevelNum = areaInfo._alertLevel;

      var handlers = areaInfo._handlers;

      var levelName = levelNumToName[levelNum];
      var when = areaInfo.toTimeString(new Date());
      for (var id in handlers) {
        var handler = handlers[id];
        handler.publish(this.name, levelNum, levelName, when, message);
        if (levelNum >= alertLevelNum && handler.alert) {
          handler.alert(this.name, levelNum, levelName, when, message);
        }
      }
      return true;
    };

    this.level = function(level) {
      if (level) this._level = toLevelNum(level);
      return levelNumToName[this._level];
    };

    this.alertLevel = function(level) {
      if (level) this._alertLevel = toLevelNum(level);
      return levelNumToName[this._alertLevel];
    };

    this.addHandlers = function() {
      for (var j = 0; j < arguments.length; j++) {
        var value = arguments[j];
        if ($.isArray(value)) {
          this.addHandlers.apply(this, value);
        } else {
          this._handlers[value] = value;
        }
      }
    };

    this.removeHandlers = function() {
      for (var j = 0; j < arguments.length; j++) {
        var value = arguments[j];
        if ($.isArray(value)) {
          this.addHandlers.apply(this, value);
        } else {
          delete this._handlers[value];
        }
      }
    };

    this.handlers = function() {
      if (arguments.length != 0) {
        this._handlers = {};
        this.addHandlers.apply(this, arguments);
      }
      var known = [];
      for (var key in this._handlers) {
        known.push(this._handlers[key]);
      }
      return known;
    };
    
    function levelNameFunction(levelNum) {
      return function(message) {
        return this.log(levelNum, message);
      }
    }

    // Add functions for levels, (area.error(), area.info(), ...).
    for (levelName in levels) {
      var functionName = levelName.toLowerCase();
      var levelNum = levelNameToNum[levelName];
      this[functionName] = levelNameFunction(levelNum);
    }
  }
  
  var logObject = {
    jog: jog,
    levels: levels,
    baseHandlers: definedHandlers,
    newHandler: newHandler
  }
})(jQuery);

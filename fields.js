var default_id_source = function(name) {
  return toIdString(name);
};

var default_field_params = {
  idSource: default_id_source,
  visible: true,
  initial: "",
  prefix: "",
  suffix: "",
  label: fieldTitleCase,
  keyClass: undefined,
  valueClass: undefined
};

function Field(name, fieldGroup, params) {
  this.name = name;
  this.fieldGroup = fieldGroup;
  $.extend(this, default_field_params, params);

  if (!this.label) {
    this.label = this.labelFor(name);
  }

  this.labelFor = function() {
    if (typeof(this.label) == 'function') {
      return this.label(name);
    }
    return String(this.label);
  };

  this.maybeBuildCells = function () {
    if (this.valueCell) return;

    var id = this.idFor();
    this.keyCell = $('<td/>');
    if (this.keyClass) {
      this.keyCell.addClass(this.keyClass);
    }
    this.keyCell.text(this.labelFor() + ':');
    this.valueCell = $('<td id="' + id + '"/>');
    if (this.valueClass) {
      this.keyCell.addClass(this.valueClass);
    }
    this.fieldGroup.insertField(this);
    this.keyCell.after(this.valueCell);
    this.updateVisibility();
  };

  this.idFor = function() {
    if (this.idPrefix) {
      return this.idPrefix + '_' + this.name;
    }
    if (typeof(this.idSource) == 'function') {
      return this.idSource(this.name);
    }
    return this.idSource.idFor(this.name);
  };

  this.updateVisibility = function () {
    function setVisibilityForCell(cell, visible) {
      if (visible) {
        cell.show();
      } else {
        cell.hide();
      }
    }

    setVisibilityForCell(this.keyCell, this.visible);
    setVisibilityForCell(this.valueCell, this.visible);
  };

  this.set = function(value) {
    this.valueType = typeof(value);
    this.maybeBuildCells();
    this.valueCell.text(this.prefix + String(value) + this.suffix);
  };

  this.get = function() {
    this.maybeBuildCells();
    var val = this.valueCell.text();
    if (this.prefix && this.prefix.length > 0) {
      if (val.indexOf(this.prefix) == 0) {
        val = val.substr(this.prefix.length);
      }
    }
    if (this.suffix && this.suffix.length > 0) {
      if (val.indexOf(this.suffix) == val.length - this.suffix.length) {
        val = val.substr(0, val.length - this.prefix.length);
      }
    }
    switch (this.valueType) {
    case 'boolean':
      return val == 'true';
    case 'number':
      return Number(val);
    default:
      return val;
    }
  };

  this.setVisible = function(visible) {
    if (visible == this.visible) return;
    this.visible = visible;
    this.maybeBuildCells();
    this.updateVisibility();
  };

  this.set(this.initial);
}

function FieldGroup(params) {
  this.fieldDefaults = {idSource: default_id_source};
  var fieldParams = {};
  var thisParams = {};
  for (var param in params) {
    if (default_field_params.hasOwnProperty(param)) {
      fieldParams[param] = params[param];
    } else {
      thisParams[param] = params[param];
    }
  }
  $.extend(this.fieldDefaults, fieldParams);

  this.order = [];
  this.fields = {};

  if (!this.wrapper) {
    //noinspection JSUnusedLocalSymbols
    this.wrapper = function(keyCell, field) {
      return keyCell;
    }
  }

  this.add = function(name, params) {
    if (this.fields[name]) return;

    this.order.push(name);
    var toPass = {};
    $.extend(toPass, this.fieldDefaults, params);
    this.fields[name] = new Field(name, this, toPass);
  };

  this.set = function(name, value) {
    if (!this.fields[name]) {
      this.add(name);
    }
    this.fields[name].set(value);
  };

  this.get = function(name) {
    if (!this.fields[name]) {
      this.add(name);
    }
    return this.fields[name].get();
  };

  this.values = function() {
    var vals = {};
    for (var name in this.fields) {
      vals[name] = this.fields[name].get();
    }
    return vals;
  };

  this.setVisible = function(name, visible) {
    this.fields[name].setVisible(visible);
  };

  this.findInsert = function(field) {
    var insertion = {};

    for (var i = 0; i < this.order.length; i++) {
      if (this.order[i] == field.name) break;
    }

    // Find the previous field that has a cell.
    var prev;
    if (i < this.order.length) {
      for (var p = i - 1; p >= 0; p--) {
        var prevField = this.fields[this.order[p]];
        if (prevField.trailingNode) {
          prev = prevField.trailingNode;
          break;
        }
      }
    }

    insertion.toInsert = this.wrapper(field.keyCell, field);
    if (prev) {
      insertion.after = prev;
    } else {
      // If there is no prevous node, this should be the first in the list
      if (this.after) {
        // Put it as the first node after the leading one
        insertion.after = this.after;
      } else {
        var first = $(this.under.children(":first-child"));
        if (first && first.length > 0) {
          // There is already at last one child, so insert this before it.
          insertion.before = first;
        } else {
          // There are no children, so add it.
          insertion.under = this.under;
        }
      }
    }

    return insertion;
  };

  this.insertField = function(field) {
    var insertion = this.findInsert(field);

    if (insertion.after) {
      insertion.after.after(insertion.toInsert);
    } else if (insertion.before) {
      insertion.before.before(insertion.toInsert);
    } else if (insertion.under) {
      insertion.under.append(insertion.toInsert);
    } else {
      throw "Insertion spec needs one of 'after', 'before', or 'under'";
    }

    if (insertion.toInsert == field.keyCell) {
      field.trailingNode = field.valueCell;
    } else {
      field.trailingNode = insertion.toInsert.last();
    }
  }

  // Putting it here allows it to override findInsert()
  $.extend(this, thisParams);
}

// Return the string used for DOM ID's for a given (card) name -- we
// canonicalize it to be always lower case, stripping out non-letters.
function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

//noinspection JSUnusedLocalSymbols
function fieldWrapInRow(keyCell, field) {
  return $('<tr/>').append(keyCell);
}

/*
 * Title Caps
 * 
 * Ported to JavaScript By John Resig - http://ejohn.org/ - 21 May 2008
 * Description: http://ejohn.org/blog/title-capitalization-in-javascript/
 * Original by John Gruber - http://daringfireball.net/ - 10 May 2008
 * License: http://www.opensource.org/licenses/mit-license.php
 */

(function() {
  var small = "(a|an|and|as|at|but|by|en|for|if|in|of|on|or|the|to|v[.]?|via|vs[.]?)";
  var punct = "([!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]*)";

  this.titleCaps = function(title) {
    var parts = [], split = /[:.;?!] |(?: |^)["\u00d2]/g, index = 0;

    while (true) {
      var m = split.exec(title);

      parts.push(title.substring(index, m ? m.index : title.length)
          .replace(/\b([A-Za-z][a-z.'\u00d2]*)\b/g,
          function(all) {
            return /[A-Za-z]\.[A-Za-z]/.test(all) ? all : upper(all);
          }).replace(new RegExp("\\b" + small + "\\b", "ig"), lower)
          .replace(new RegExp("^" + punct + small + "\\b", "ig"),
          function(all, punct, word) {
            return punct + upper(word);
          }).replace(new RegExp("\\b" + small + punct + "$", "ig"), upper));

      index = split.lastIndex;

      if (m) parts.push(m[0]); else break;
    }

    return parts.join("").replace(/ V(s?)\. /ig, " v$1. ")
        .replace(/(['\u00d2])S\b/ig, "$1s").replace(/\b(AT&T|Q&A)\b/ig,
        function(all) {
          return all.toUpperCase();
        });
  };

  function lower(word) {
    return word.toLowerCase();
  }

  function upper(word) {
    return word.substr(0, 1).toUpperCase() + word.substr(1);
  }
})();

function fieldTitleCase(str) {
  return titleCaps(str);
}

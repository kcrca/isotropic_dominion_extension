var default_id_source = function(name) {
  return toIdString(name);
}

var default_field_params = {
  idSource: default_id_source,
  visible: true,
  initial: "",
  prefix: "",
  suffix: "",
  label: "Value",
  keyClass: undefined,
  valueClass: undefined
};

function Field(name, fieldGroup, params) {
  this.name = name;
  this.fieldGroup = fieldGroup;
  params.label = params.label || name;
  for (var param in default_field_params) {
    if (params[param] != undefined) {
      this[param] = params[param];
    } else {
      this[param] = default_field_params[param];
    }
  }

  this.maybeBuildCells = function () {
    if (this.valueCell) return;

    var id = this.idFor();
    this.keyCell = $('<td/>');
    if (this.keyClass) {
      this.keyCell.addClass(this.keyClass);
    }
    this.keyCell.text(this.label + ':');
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
    this.maybeBuildCells(this.idSource);
    this.updateVisibility();
  };

  this.set(params.initial);
}

function FieldGroup(params) {
  if (!params.under && !params.after) {
    throw "Must provide either 'under' or 'after' parameter";
  }
  this.fieldDefaults = {};
  for (var param in params) {
    if (default_field_params[param]) {
      this.fieldDefaults[param] = params[param];
    } else {
      this[param] = params[param];
    }
  }

  if (!this.fieldDefaults.idSource) {
    this.fieldDefaults.idSource = default_id_source;
  }

  this.order = [];
  this.fields = {};

  if (!this.wrapper) {
    this.wrapper = function(keyCell, field) {
      return keyCell;
    }
  }

  this.add = function(name, params) {
    if (this.fields[name]) return;

    this.order.push(name);
    params = params || {};
    for (var param in default_field_params) {
      if (this.fieldDefaults[param] && !params[param]) {
        params[param] = this.fieldDefaults[param];
      }
    }
    this.fields[name] = new Field(name, this, params);
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

  this.insertField = function(field) {
    for (var i = 0; i < this.order.length; i++) {
      if (this.order[i] == field.name) break;
    }

    // Find the previous field that has a cell.
    var prev;
    for (var p = i - 1; p >= 0; p--) {
      var f = this.fields[this.order[p]];
      if (f.trailingNode) {
        prev = f.trailingNode;
        break;
      }
    }

    var toInsert = this.wrapper(field.keyCell, field);
    if (toInsert == field.keyCell) {
      field.trailingNode = field.valueCell;
    } else {
      field.trailingNode = toInsert.last();
    }

    if (prev) {
      // Put this after the (existing) previous node.
      prev.after(toInsert);
    } else {
      // If there is no prevous node, this should be the first in the list
      if (this.after) {
        // Put it as the first node after the leading one
        this.after.after(toInsert);
      } else {
        var first = $(this.under[0].firstElementChild);
        if (first && first.length > 0) {
          // There is already at last one child, so insert this before it.
          first.before(toInsert);
        } else {
          // There are no children, so add it.
          this.under.append(toInsert);
        }
      }
      // If we inserting the key cell itself, our trailing node is the value
    }
  }
}

// Return the string used for DOM ID's for a given (card) name -- we
// canonicalize it to be always lower case, stripping out non-letters.
function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

function fieldWrapInRow(keyCell, field) {
  return $('<tr/>').append(keyCell);
}

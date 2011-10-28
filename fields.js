Field.default_id_source = function(name) {
  return toIdString(name);
};

Field.default_is_visible = function(field) {
  return field.visible;
};

Field.visible_at_nodes = function(field) {
  return [field.keyNode, field.valueNode];
};

Field.visible_at_inserted = function(field) {
  return field.inserted;
};

Field.visible_by_contents = function(field, node) {
  if (!field.visible) {
    node.text('');
  }
};

Field.visible_by_show = function(field, node) {
  if (field.visible) {
    node.show();
  } else {
    node.hide();
  }
};

Field.default_field_params = {
  // The source for ID's, which can be a function or an object with idFor(str)
  idSource: Field.default_id_source,
  // Function to say if field is visible; the default returns field.visible.
  isVisible: Field.default_is_visible,
  // For default isVisible(), whether the field is currently visible
  visible: true,
  // Where visibility is set. Can be node, array of nodes, or function that
  // returns either. These nodes are controlled by isVisible(). The default
  // is a function returning the key and value nodes.
  visibleAt: Field.visible_at_nodes,
  // The initial value for the field.
  visibleBy: Field.visible_by_show,
  initial: "",
  // A prefix to appear before the value.
  prefix: "",
  // A suffix to appear after the value.
  suffix: "",
  // The label to use. Can be an object or a function that returns one. The
  // label will be String() of that object. The default is to use the name
  // capitalized (title cased) with a ":".
  label: fieldTitleCase,
  // The HTML tag to use in created key and value nodes.
  tag: 'td',
  // The class for key node, if not undefined.
  keyClass: undefined,
  // The class for value node, if not undefined.
  valueClass: undefined
};

// A single field, usually crated via a FieldGroup
function Field(name, fieldGroup, params) {
  var self = this;
  this.name = name;
  this.fieldGroup = fieldGroup;
  $.extend(this, Field.default_field_params, params);

  this.resolve = function(value) {
    while ($.isFunction(value)) {
      value = value(self);
    }
    return value;
  };

  this.resolveStr = function(value) {
    value = this.resolve(value);
    return value ? String(value) : value;
  };

  // Build the cells if they need to be built.
  var maybeBuildCells = function () {
    if (self.valueNode) return;

    var id = self.idFor(self.name);

    function makeNode(which) {
      var node = $('<' + self.resolveStr(self.tag) + '/>');
      node.attr('id', id + which);
      var classParam = self[which + 'Class'];
      if (classParam) {
        node.addClass(self.resolveStr(classParam));
      }
      return node;
    }

    self.keyNode = makeNode('key');
    self.keyNode.text(self.resolveStr(self.label) + ': ');
    self.valueNode = makeNode('value');

    self.fieldGroup.insertField(self);
    // If inserting didn't also insert the value node, put it after the key.
    if (self.valueNode.parent().length == 0 &&
        self.valueNode.prev().length == 0) {
      self.keyNode.after(self.valueNode);
    }

    updateVisibility();
  };

  // Return the id base for this field; used to create key and value IDs
  this.idFor = function() {
    if (this.idPrefix) {
      return this.resolveStr(this.idPrefix) + '_' + this.name;
    }
    if ($.isFunction(this.idSource)) {
      return this.idSource(this.name);
    }
    return this.idSource.idFor(this.name);
  };

  // update the visibility of this field to what it should be now.
  var updateVisibility = function () {
    var list = self.resolve(self.visibleAt);
    if (!$.isArray(list)) {
      list = [list];
    }
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (!node) continue;
      self.visibleBy(self, node);
    }
  };
  // Get the value for this field. The prefix and suffix (if any) are dropped.
  this.get = function() {
    maybeBuildCells();
    var val = this.valueNode.text();
    if (this.prefix && this.prefix.length > 0) {
      if (val.indexOf(this.prefix) == 0) {
        val = val.substr(this.prefix.length);
      }
    }
    if (this.suffix && this.suffix.length > 0) {
      if (val.indexOf(this.suffix) == val.length - this.suffix.length) {
        val = val.substr(0, val.length - this.suffix.length);
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

  // Set the value for this field. The prefix and suffix (if any) are added.
  this.set = function(value) {
    this.valueType = typeof(value);
    maybeBuildCells();
    this.valueNode.html(this.prefix + String(value) + this.suffix);
    this.setVisible(this.isVisible(this));
  };

  //!! Make this work for all values.
  this.change = function(params) {
    // See if this actually changes anything before we do any real work.
    var changed = false;
    for (var key in params) {
      if (params[key] != this[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    var value = this.get();
    var orig = {};
    $.extend(orig, this);
    $.extend(this, params);
    this.set(value);
    if (params.visible) {
      this.visible = orig.visible;
      this.setVisible(params.visible);
    }
  };

  // Set whether this is visible or not.
  this.setVisible = function(visible) {
    if (visible == this.visible) return;
    this.visible = visible;
    maybeBuildCells();
    updateVisibility();
  };

  this.set(this.resolve(this.initial));

  this.toString = function() {
    maybeBuildCells();
    return this.keyNode.text() + this.valueNode.text();
  }
}

// A field group manages a set of Field objects. Any params passed in that are
// Field parameters will be the default values for all fields in this group.
// All other values are set on this object. Fields will be shown in the order
// added.
//
// Values on this object are
//    wrapper:  If defined, a function that wraps the key node before insertion.
//              This is used by the default implementation of findInsert()
//    order:    If provided, the order in which fields will be displayed. The
//              default is to show them in the order they are inserted.
//    ignoreUnknown:
//              If set to true, fields with unknown names will be ignored, not
//              added to the group.
//
function FieldGroup(params) {
  var fieldDefaults = {idSource: Field.default_id_source};
  var fieldParams = {};
  var thisParams = {};

  // If you override this.order, fields will be displayed in that order.
  this.order = [];

  this.ignoreUnknown = false;

  //noinspection JSUnusedLocalSymbols
  this.wrapper = function(keyNode, field) {
    return keyNode;
  };

  for (var param in params) {
    if (Field.default_field_params.hasOwnProperty(param)) {
      fieldParams[param] = params[param];
    } else {
      thisParams[param] = params[param];
    }
  }
  $.extend(fieldDefaults, fieldParams);

  var fields = {};

  // Handle an unknown field (add or ignore). Returns true if the code can
  // proceed assuming the field exists; false means it should proceed as if it
  // doesn't exist.
  this.handleUnknownField = function (name) {
    if (fields[name]) return true;
    if (this.ignoreUnknown) return false;
    this.add(name);
    return true;
  };

  // Add a field to this group, overriding defaults using params
  this.add = function(name, params) {
    if (fields[name]) return;

    if ($.inArray(name, this.order) < 0) {
      this.order.push(name);
    }
    var toPass = {};
    $.extend(toPass, fieldDefaults, params);
    fields[name] = new Field(name, this, toPass);
  };

  // Get the value of a field; see Field.get()
  this.get = function(name) {
    if (this.handleUnknownField(name)) {
      return fields[name].get();
    }
    return undefined;
  };

  // Set the value of a field; see Field.set()
  this.set = function(name, value) {
    if (this.handleUnknownField(name)) {
      fields[name].set(value);
    }
  };

  // Return the actual field object, or undefined if it is currently not defined
  this.field = function(name) {
    return fields[name];
  };

  this.change = function(name, params) {
    if (this.handleUnknownField(name)) {
      fields[name].change(params);
    }
  };

  // Return the values of all the fields as an array
  this.values = function() {
    var vals = {};
    for (var name in fields) {
      vals[name] = fields[name].get();
    }
    return vals;
  };

  // Set whether the field is visible; see Field.setVisible()
  this.setVisible = function(name, visible) {
    if (this.handleUnknownField(name)) {
      fields[name].setVisible(visible);
    }
  };

  // Find where to insert a new field's key. You can replace this.
  //
  // This function must return an object that says where to place the key. The
  // fields of that object are:
  //
  //    before    Insert the key before this object;
  //    after     Insert the key after this object.
  //    under     Append the key to this object.
  //    toInsert  Object to insert, which must be the key or contain it as a
  //              descendant. (If toInsert doesn't contain the value node, the
  //              value node will be placed immediately after the key node.)
  //
  // Exactly one of before, after, or under must be specified.
  //
  // This default implementation finds where it goes in the order, and places it
  // after there, placing all the nodes under the field this.under, or after
  // this.after, depending on which is present.
  this.findInsert = function(field) {
    var insertion = {};

    var i = $.inArray(field.name, this.order);

    // Find the previous field that has a cell.
    var prev;
    if (i >= 0) {
      for (var p = i - 1; p >= 0; p--) {
        var prevField = fields[this.order[p]];
        if (prevField.trailingNode) {
          prev = prevField.trailingNode;
          break;
        }
      }
    }

    insertion.toInsert = this.wrapper(field.keyNode, field);
    if (prev) {
      insertion.after = prev;
    } else {
      // If there is no previous node, this should be the first in the list
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

  // Called by the field to insert the field HTML nodes.
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
    field.inserted = insertion.toInsert;

    if (insertion.toInsert == field.keyNode) {
      field.trailingNode = field.valueNode;
    } else {
      field.trailingNode = insertion.toInsert.last();
    }
  };

  // Putting it here allows it to override findInsert()
  $.extend(this, thisParams);

  this.toString = function() {
    var strs = [];
    for (var i = 0; i < this.order.length; i++) {
      var name = this.order[i];
      var field = fields[name];
      if (field.visible) {
        strs.push(field.toString());
      }
    }
    return strs.join(", ");
  }
}

// Return the string used for DOM ID's for a given (card) name -- we
// canonicalize it to be always lower case, stripping out non-letters.
function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

//noinspection JSUnusedLocalSymbols
function fieldWrapInRow(keyNode, field) {
  return $('<tr/>').append(keyNode);
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

function fieldTitleCase(field) {
  return titleCaps(field.name);
}

function fieldInvisibleIfEmpty(field) {
  return (field.get() != '');
}

function fieldInvisibleIfZero(field) {
  return (field.get() != 0);
}
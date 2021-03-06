// For players who have spaces in their names, a map from name to name
// rewritten to have underscores instead. Pretty ugly, but it works.
var player_rewrites = new Object();

// Map from player name to Player object.
var players = undefined;
// Regular expression that is an OR of players other than "You".
var player_re = "";
// Count of the number of players in the game.
var player_count = 0;

// Are we in text mode (vs. image mode) in the UI?
var text_mode;

// pseudo-player for Trash card counts
var tablePlayer;

// Map that contains the cards in the supply piles; other cards need to be shown
// shown in other ways.
var supplied_cards;

var maxTradeRoute;

// Places to print number of cards and points.
var deck_spot;
var points_spot;

// How many different player classes are supported?
var PLAYER_CLASS_COUNT = 4;

var started = false;
var introduced = false;
var i_introduced = false;
var disabled = false;
var had_error = false;
var show_action_count = false;
var show_unique_count = false;
var show_victory_count = false;
var show_duchy_count = false;
var possessed_turn = false;
var announced_error = false;
var seen_first_turn = false;

// Enabled by debugger when analyzing game logs.
var debug_mode = false;

var last_player = null;
var last_reveal_player = null;
var last_reveal_card = null;

var turn_number = 0;

// The player's own icon
var my_icon = null;

// Last time a status message was printed.
var last_status_print = 0;

// The last player who gained a card.
var last_gain_player = null;

// Track scoping of actions in play such as Watchtower.
var scopes = [];

// The version of the extension currently loaded.
var extension_version = 'Unknown';

var restoring_history = false;

// Tree is being rewritten, so should not process any tree change events.
var rewritingTree = 0;

var debug = {'actvData': false, 'infoData': true, 'logShown': true };

var infoIsForTests = false;

var test_only_my_score = false;

// This is to let us play around with prefix characters for generated text.
var chat_prefix_symbols = debug['chatPrefix'] ? "⟣⟡∷⊹" : "⟣";
var chat_prefix_num = 0;
var chat_prefix = chat_prefix_symbols[chat_prefix_num];

// Quotes a string so it matches literally in a regex.
RegExp.quote = function(str) {
  return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1");
};

// Returns an html encoded version of a string.
function htmlEncode(value) {
  return $('<div/>').text(value).html();
}

// Keep a map from all card names (singular or plural) to the card object.
var card_map = {};

(function() {
  // The card list is just to log the cards 10 at a time so I have a list of all
  // cards in groups I can request to use for testing.
  var cardList = "\n";
  for (var i = 0; i < card_list.length; i++) {
    var card = card_list[i];
    card_map[card.Singular] = card;
    card_map[card.Plural] = card;
    if (i % 10 != 0) cardList += ', ';
    cardList += (card.Singular);
    if (i % 10 == 9 || i == card_list.length - 1) {
      console.log(cardList + "\n");
      cardList = "\n";
    }
    card.isAction = function() {
      return this.Action != "0";
    };
    card.isTreasure = function() {
      return this.Treasure != "0";
    };
    card.isDuration = function() {
      return this.Duration != "0";
    };
    card.getBuys = function() {
      return parseInt(this.Buys);
    };
    card.getActions = function() {
      return parseInt(this.Actions);
    };
    card.getVP = function() {
      var num = parseInt(this.VP);
      return isNaN(num) ? 0 : num;
    };
    card.getCoinCount = function() {
      return (
          this.Coins == "?" || this.Coins == "P" ? 0 : parseInt(this.Coins));
    };
    card.getPotionCount = function() {
      return (this.Coins == "P" ? 1 : 0);
    };
    card.getCoinCost = function() {
      var cost = this.Cost;
      cost = (cost.charAt(0) == 'P' ? cost.substr(1) : cost);
      return parseInt(cost);
    };
    card.getPotionCost = function() {
      return (this.Cost.indexOf("P") >= 0 ? 1 : 0);
    };
  }

  // This patches known bugs in the card list and reports the patch in the log
  // so we don't forget to get it actually fixed. If it finds the bug is not
  // still in the list, it reports it so the fix can be dropped from our code.
  function patchCardBug(cardName, prop, correctValue, report) {
    report = report || false;
    var tableValue = card_map[cardName][prop];
    if (tableValue != correctValue && report) {
      console.log('Note: patching card_list: changing ' + cardName + '.' +
          prop + ' from ' + tableValue + ' to ' + correctValue);
      card_map[cardName][prop] = correctValue;
    }
  }

  patchCardBug('Horse Traders', 'Action', '1');
  patchCardBug('Hunting Party', 'Action', '1');
  patchCardBug('Fortune Teller', 'Action', '1');
  patchCardBug('Fairgrounds', 'VP', '?');
  // With Trusty Steed, it lists all *possible* outcomes as *actual*
  patchCardBug('Trusty Steed', 'Actions', '0');
  patchCardBug('Trusty Steed', 'Treasure', '0');
  patchCardBug('Trusty Steed', 'Cards', '0');
  patchCardBug('Trusty Steed', 'Plural', 'Trusty Steeds');

  // Not actually a bug -- Mandarin *does* get you $3, but the game reports it
  // the same way it does for variable-value cards (like Bank), so the normal
  // code adds it in there automatically. Rather than put in a special case in
  // that code, we'll just pretend it gives you no coins.
  patchCardBug('Mandarin', 'Coins', '0', false);
})();

function rewriteName(name) {
  return name.replace(/ /g, "_").replace(/'/g, "’").replace(/\./g, "");
}

function handleError(text) {
  console.log(text);
  if (!had_error) {
    had_error = true;
    alert("Point counter error. Results may no longer be accurate: " + text);
  }
}

function getSayButton() {
  var blist = document.getElementsByTagName('button');
  for (var button in blist) {
    if (blist[button].innerText == "Say") {
      return blist[button];
    }
  }
  return null;
}

function writeText(text) {
  // Get the fields we need for being able to write text.
  var input_box = document.getElementById("entry");
  var say_button = getSayButton();

  if (input_box == null || input_box == undefined || !say_button) {
    handleError("Can't write text -- button or input box is unknown.");
    return;
  }
  var old_input_box_value = input_box.value;
  input_box.value = text;
  say_button.click();
  input_box.value = old_input_box_value;
}

function maybeAnnounceFailure(text) {
  if (!disabled && !announced_error) {
    console.log("Logging error: " + text);
    writeText(text);
  }
  announced_error = true;
}

function pointsForCard(card_name) {
  if (card_name == undefined) {
    handleError("Undefined card for points...");
    return 0;
  }

  var card = card_map[card_name];
  return card.getVP();
}

function Player(name, num) {
  // This alias is used in nested functions that execute in other contexts
  var self = this;

  this.name = name;
  this.score = 3;
  this.deck_size = 10;
  this.icon = undefined;

  this.isTable = name == "";

  // The set of "other" cards -- ones that aren't in the supply piles
  this.otherCards = {};

  if (this.isTable) {
    this.idPrefix = "table";
  } else {
    this.idPrefix = "player" + num;
  }

  // Return the player-specific name for a general category. This is typically
  // used for DOM node ID but can also be used as a DOM class name.
  this.idFor = function(category) {
    return this.idPrefix + "_" + toIdString(category);
  };

  // Define the general player class used for CSS styling
  if (name == "You") {
    this.classFor = "you";
  } else if (this.isTable) {
    this.classFor = "table";
  } else {
    // CSS cycles through PLAYER_CLASS_COUNT display classes
    this.classFor = "player" + ((num - 1) % PLAYER_CLASS_COUNT + 1);
  }

  // Map from special counts (such as number of gardens) to count.
  this.special_counts = { "Treasure" : 7, "Victory" : 3, "Uniques" : 2 };
  this.card_counts = { "Copper" : 7, "Estate" : 3 };
  this.cards_aside = {};

  if (this.isTable) {
    this.special_counts = {};
    this.card_counts = {};
    this.deck_size = 0;
    this.score = 0;
  }

  // Remember the img node for the player's icon
  this.setIcon = function(imgNode) {
    if (imgNode == null) return;
    this.icon = imgNode.cloneNode(true);
    this.icon.removeAttribute('class');
    this.icon.setAttribute('align', 'top');
    $('#' + this.idFor('name')).contents().first().before(this.icon);
  };

  this.updateScore = function() {
    this.fields.set('score', this.getScore());
  };

  this.updateDeck = function() {
    this.fields.set('deck', this.getDeckString());
  };

  this.getScore = function() {
    var score_str = this.score + "";
    var total_score = this.score;

    if (this.special_counts["Gardens"] != undefined) {
      var gardens = this.special_counts["Gardens"];
      var garden_points = Math.floor(this.deck_size / 10);
      score_str = score_str + "+" + gardens + "g@" + garden_points;
      total_score = total_score + gardens * garden_points;
    }

    if (this.special_counts["Silk Roads"] != undefined) {
      var silk_roads = this.special_counts["Silk Roads"];
      var silk_road_points = 0;
      if (this.special_counts["Victory"] != undefined) {
        silk_road_points = Math.floor(this.special_counts["Victory"] / 4);
      }
      score_str = score_str + "+" + silk_roads + "s@" + silk_road_points;
      total_score = total_score + silk_roads * silk_road_points;
    }

    if (this.special_counts["Duke"] != undefined) {
      var dukes = this.special_counts["Duke"];
      var duke_points = 0;
      if (this.special_counts["Duchy"] != undefined) {
        duke_points = this.special_counts["Duchy"];
      }
      score_str = score_str + "+" + dukes + "d@" + duke_points;
      total_score = total_score + dukes * duke_points;
    }

    if (this.special_counts["Vineyard"] != undefined) {
      var vineyards = this.special_counts["Vineyard"];
      var vineyard_points = 0;
      if (this.special_counts["Actions"] != undefined) {
        vineyard_points = Math.floor(this.special_counts["Actions"] / 3);
      }
      score_str = score_str + "+" + vineyards + "v@" + vineyard_points;
      total_score = total_score + vineyards * vineyard_points;
    }

    if (this.special_counts["Fairgrounds"] != undefined) {
      var fairgrounds = this.special_counts["Fairgrounds"];
      var fairgrounds_points = 0;
      if (this.special_counts["Uniques"] != undefined) {
        fairgrounds_points = Math.floor(this.special_counts["Uniques"] / 5) * 2;
      }
      score_str = score_str + "+" + fairgrounds + "f@" + fairgrounds_points;
      total_score = total_score + fairgrounds * fairgrounds_points;
    }

    if (score_str.indexOf("@") > 0) {
      score_str = score_str + "=" + total_score;
    }
    return score_str;
  };

  this.getDeckString = function() {
    var str = this.deck_size;
    var need_action_string = (show_action_count &&
        this.special_counts["Actions"]);
    var need_unique_string = (show_unique_count &&
        this.special_counts["Uniques"]);
    var need_victory_string = (show_victory_count &&
        this.special_counts["Victory"]);
    var need_duchy_string = (show_duchy_count && this.special_counts["Duchy"]);
    if (need_action_string || need_unique_string || need_duchy_string ||
        need_victory_string) {
      var special_types = [];
      if (need_unique_string) {
        special_types.push(this.special_counts["Uniques"] + "u");
      }
      if (need_action_string) {
        special_types.push(this.special_counts["Actions"] + "a");
      }
      if (need_duchy_string) {
        special_types.push(this.special_counts["Duchy"] + "d");
      }
      if (need_victory_string) {
        special_types.push(this.special_counts["Victory"] + "v");
      }
      str += '(' + special_types.join(", ") + ')';
    }
    return str;
  };

  this.changeScore = function(points) {
    this.score = this.score + parseInt(points);
  };

  this.changeSpecialCount = function(name, delta) {
    if (this.special_counts[name] == undefined) {
      this.special_counts[name] = 0;
    }
    this.special_counts[name] = this.special_counts[name] + delta;
  };

  this.updateCardDisplay = function(name) {
    var cardId = this.idFor(name);
    var cardCountCell = document.getElementById(cardId);
    if (cardCountCell) {
      cardCountCell.innerHTML = this.cardCountString(name);
    }
  };

  this.recordCards = function(name, count) {
    if (this.card_counts[name] == undefined || this.card_counts[name] == 0) {
      this.card_counts[name] = count;
      this.special_counts["Uniques"] += 1;
    } else {
      this.card_counts[name] += count;
    }

    if (this.card_counts[name] <= 0) {
      if (this.card_counts[name] < 0) {
        maybeAnnounceFailure("Card count for " + name + " is negative (" +
            this.card_counts[name] + ")");
      }
      delete this.card_counts[name];
      this.special_counts["Uniques"] -= 1;
    }
    this.updateCardDisplay(name);
  };

  this.recordSpecialCards = function(card, count) {
    var name = card.innerHTML;
    if (name.indexOf("Gardens") == 0) {
      this.changeSpecialCount("Gardens", count);
    }
    if (name.indexOf("Duke") == 0) {
      this.changeSpecialCount("Duke", count);
    }
    if (name.indexOf("Duchy") == 0 || name.indexOf("Duchies") == 0) {
      this.changeSpecialCount("Duchy", count);
    }
    if (name.indexOf("Vineyard") == 0) {
      this.changeSpecialCount("Vineyard", count);
    }
    if (name.indexOf("Fairgrounds") == 0) {
      this.changeSpecialCount("Fairgrounds", count);
    }
    if (name.indexOf("Silk Road") == 0) {
      this.changeSpecialCount("Silk Roads", count);
    }

    var types = card.className.split("-").slice(1);
    for (var type_i in types) {
      var type = types[type_i];
      if (type == "none" || type == "duration" || type == "action" ||
          type == "reaction") {
        this.changeSpecialCount("Actions", count);
      } else if (type == "curse") {
        this.changeSpecialCount("Curse", count);
      } else if (type == "victory") {
        this.changeSpecialCount("Victory", count);
      } else if (type == "treasure") {
        this.changeSpecialCount("Treasure", count);
      } else {
        handleError("Unknown card class: " + card.className + " for " +
            card.innerText);
      }
    }
  };

  // Add a card to a group of cards. Adding in the 'cardname' attribute means
  // that hovering over the card will pop up the tooltip window about the card.
  this.addToCardGroup = function(which, cardElem, count, updateField) {
    count = count != undefined ? count : 1;
    updateField = updateField != undefined ? updateField : true;
    var group = this[which];
    if (!group) group = this[which] = {};
    var cardName = getSingularCardName(cardElem.text());
    var cardInfo = group[cardName];
    if (!cardInfo) {
      cardInfo = group[cardName] = new Object();
      cardInfo.count = 0;
      cardInfo.card = card_map[cardName];
      if (!cardElem.attr('cardname')) {
        // we need a copy so we can add the 'cardname' attribute to it
        cardElem = cardElem.clone();
        cardElem.attr('cardname', cardName);
      }
      cardInfo.html = cardElem[0].outerHTML;
    }
    cardInfo.count += count;
    if (cardInfo.count <= 0) {
      delete group[cardName];
    }
    if (updateField) {
      this.fields.set(which, this.cardGroupHtml(which));
    }
  };

  // Return HTML string to display the give card group.
  this.cardGroupHtml = function(which, sort) {
    sort = sort != undefined ? sort : false;
    var group = this[which];
    var html = '';
    var keys = [];
    for (var key in group) {
      keys.push(key);
    }
    if (sort) {
      keys.sort();
    }
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      if (html.length > 0) {
        html += ", ";
      }
      var cardInfo = group[name];
      if (cardInfo.count == 1) {
        html += cardInfo.html;
      } else {
        var card = cardInfo.card;
        var cardElemHtml = cardInfo.html;
        if (card.Singular != card.Plural) {
          // we use the '>' because we don't want to change the cardname attr.
          cardElemHtml =
              cardElemHtml.replace('>' + card.Singular, '>' + card.Plural);
        }
        html += cardInfo.count + '&nbsp;' + cardElemHtml;
      }
    }
    return html;
  };

  this.clearCardGroup = function(which) {
    this[which] = {};
    this.fields.set(which, this.cardGroupHtml(which));
  };

  this.gainCard = function(elem, count, trashing) {
    if (debug_mode) {
      $('#log').children().eq(-1).before('<div class="gain_debug">*** ' + name +
          " gains " + count + " " + elem.innerText + "</div>");
    }

    last_gain_player = this;
    count = parseInt(count);
    this.deck_size = this.deck_size + count;

    var singular_card_name = getSingularCardName(elem.innerText);
    this.changeScore(pointsForCard(singular_card_name) * count);
    this.recordSpecialCards(elem, count);
    this.recordCards(singular_card_name, count);

    trashing = trashing == undefined ? true : trashing;
    if (!supplied_cards[singular_card_name]) {
      this.addToCardGroup('otherCards', $(elem), count);
    }

    // If the count is going down, usually player is trashing a card.
    if (!this.isTable && count < 0 && trashing) {
      tablePlayer.gainCard(elem, -count);
    }
    if (trashing || this.isTable) {
      updateDeck(tablePlayer);
    }
    maybeWatchTradeRoute();
  };

  // This player has resigned; remember it.
  this.setResigned = function() {
    if (this.resigned) return;

    // In addition to other classes, this is now in the "resigned" class.
    $("." + this.classFor).addClass("resigned");
    this.classFor += " resigned";
    this.resigned = true;
  };

  this.setAside = function(elems) {
    for (var i = 0; i < elems.length; i++) {
      var card = elems[i];
      var cardName = getSingularCardName(card.innerText);
      if (!this.cards_aside[cardName]) {
        this.cards_aside[cardName] = 1;
      } else {
        this.cards_aside[cardName]++;
      }
      this.deck_size--;
      this.updateCardDisplay(cardName);
    }
  };

  this.asideCount = function() {
    var count = 0;
    for (var cardName in this.cards_aside) {
      var aside = this.cards_aside[cardName];
      if (aside) {
        count += aside;
      }
    }
    return count;
  };

  this.cardCountString = function(cardName) {
    var count = this.card_counts[cardName];
    if (count == undefined || count == 0) {
      return '-';
    }

    var aside = this.cards_aside[cardName];
    if (aside == undefined || aside == 0) {
      return count + "";
    } else {
      return count + '(' + aside + '<span class="asideCountNum">i</span>)';
    }
  };

  this.get = function(field) {
    return this.fields.get(field);
  };

  this.set = function(field, value) {
    rewriteTree(function () {
      self.fields.set(field, value);
    });
  };

  this.add = function(name, params) {
    rewriteTree(function() {
      self.fields.add(name, params);
    });
  };

  this.change = function(name, params) {
    rewriteTree(function() {
      self.fields.change(name, params);
    });
  };

  this.changeField = function(field, delta) {
    var before = this.get(field);
    var after = before + delta;
    if (before != after) {
      logDebug('infoData',
          this.name + ": change " + field + ": " + before + " → " + after);
      this.set(field, after);
    }
  };

  this.countString = function() {
    this.deckCards = {};
    var scratchElem = $('<span/>');
    for (var cardName in this.card_counts) {
      var count = this.card_counts[cardName];
      scratchElem.text(cardName);
      this.addToCardGroup('deckCards', scratchElem, count, false);
    }

    var str = htmlToText(this.cardGroupHtml('deckCards', true));
    if (str.length == 0) str = "none";
    var myName = this.isTable ? "Trash" : this.name;
    return myName + ': ' + str;
  };

  this.infoString = function() {
    return this.name + ': ' + this.fields.toString();
  };

  activeDataSetupPlayer(this);

  rewriteTree(function() {
    var ptab = $('#playerDataTable')[0];
    var row1 = addRow(ptab, self.classFor,
        activeDataColumn(self) + '<td id="' + self.idFor('mark') +
            '" class="rowStretch markPlace"></td>' + '<td id="' +
            self.idFor('name') + '" class="playerDataName" rowspan="0">' +
            originalName(self.name) + '</td>');
    row1.attr('id', self.idFor('firstRow'));

    var stetchCells = row1.children('.rowStretch');
    var playerCell = row1.children('#' + self.idFor('name'));
    if (self.icon != undefined) {
      playerCell.children().first().before(self.icon.cloneNode(true))
    }
    var seenWide = undefined;
    var firstWide = 'otherCards';
    var prev;
    var fieldInsertPos = function(field) {
      if (field.name == firstWide) {
        seenWide = $.inArray(field.name, fields.order);
      }

      var keyCell = $('<td/>').append(field.keyNode);
      var valCell = $('<td/>').append(field.valueNode);
      var cells = keyCell.add(valCell);

      if (!self.seenFirst) {
        self.seenFirst = true;
        return {toInsert: cells, after: $('#' + self.idFor('name'))};
      }

      function incrementRowspan(cell) {
        var curSpan = cell.attr('rowspan');
        if (!curSpan) {
          curSpan = '1';
        }
        cell.attr('rowspan', parseInt(curSpan) + 1);
      }

      stetchCells.each(function() {
        incrementRowspan($(this));
      });

      var row = $('<tr/>').addClass(self.classFor);
      if (!seenWide || $.inArray(field.name, fields.order) < seenWide) {
        incrementRowspan(playerCell);
        row.append(cells);
      } else {
        var cell = $('<td/>').attr('colspan', 3).addClass('playerOtherCards');
        row.append(cell);
        cell.append(field.keyNode);
        field.keyNode.after(field.valueNode);
      }

      var after = (prev ? prev : $('#' + self.idFor('firstRow')));
      prev = row;
      return {toInsert: row, after: after};
    };

    var fields = new FieldGroup({idSource: self, tag: 'span',
      findInsert: fieldInsertPos,
      keyClass: 'playerDataKey', valueClass: 'playerDataValue',
      ignoreUnknown: self.isTable});
    self.fields = fields;

    if (self.isTable) {
      fields.add('tradeRoute', {label: "Trade Route", prefix: '$',
        initial: 0, visible: false });
      fields.add('deck', {label: "Trash", initial: self.getDeckString()});
    } else {
      fields.add('score', {initial: self.getScore(), valueClass: 'scoreValue'});
      fields.add('deck', {initial: self.getDeckString()});
      fields.add('pirateShipTokens', {label: 'Pirate Ship', prefix: '$',
        initial: 0, isVisible: fieldInvisibleIfZero});
    }
    fields.add('otherCards',
        {label: self.isTable ? 'Other Trash' : 'Other Cards',
          initial: self.cardGroupHtml('otherCard'),
          isVisible: fieldInvisibleIfEmpty});
    if (!self.isTable) {
      // Native Village for "You" lists cards; for others it's just a count.
      var initialNV = 0;
      var visibleNV = fieldInvisibleIfZero;
      if (self.name == "You") {
        initialNV = self.cardGroupHtml('nativeVillage');
        visibleNV = fieldInvisibleIfEmpty;
      }
      fields.add('nativeVillage', {
        label: "Native Village", initial: initialNV, isVisible: visibleNV});
      fields.add('durations', {
        initial: self.cardGroupHtml('durations'),
        isVisible: fieldInvisibleIfEmpty});
    }
  });
}

function htmlToText(html) {
  return $('<span/>').html(html).text()
}

function stateStrings() {
  var state = '';
  for (var player in players) {
    player = players[player];
    state += player.name + ':' + player.getScore() + " points [deck size is " +
        player.getDeckString() + "] - " +
        JSON.stringify(player.special_counts) + "<br>" +
        JSON.stringify(player.card_counts) + "<br>";
  }
  return state;
}

function getSingularCardName(name) {
  return card_map[name].Singular;
}

function getPlayer(name) {
  if (players[name] == undefined) return null;
  return players[name];
}

function tempSayChange() {
  var clones = $('#temp_say').contents().clone();
  var copy = $('#copied_temp_say');

  rewriteTree(function () {
    copy.empty();
    copy.append(clones);
  });
}

// Create the full log blob and hide the normal log part.
function createFullLog() {
  rewriteTree(function () {
    $('#full_log').remove();
    var full_log = $('<pre id="full_log"/>');
    $('#log').hide().before(full_log);
    var temp_say = $('#temp_say');
    var copied_temp_say = temp_say.clone();
    copied_temp_say.attr('id', 'copied_temp_say');
    full_log.append(copied_temp_say);
    temp_say.bind('DOMSubtreeModified', tempSayChange);
  });
}

function maybeAddToFullLog(node) {
  $('#copied_temp_say').before($(node).clone());
}

function findTrailingPlayer(text) {
  var arr = text.match(/ ([^\s.]+)\.[\s]*$/);
  if (arr != null && arr.length == 2) {
    return getPlayer(arr[1]);
  }
  handleError("Could not find trailing player from: " + text);
  return null;
}

// Check to see if the node shows that a player resigned.
function maybeHandleResignation(node) {
  if (node.innerText.match(/ resigns? from the game/)) {
    last_player.setResigned();
    return true;
  }
  return false;
}

function maybeHandleFirstTurn() {
  if (seen_first_turn) return;

  seen_first_turn = true;

  // It may be hidden during veto.
  $('#playerDataTable').show();

  // Figure out which cards are in supply piles
  supplied_cards = {};
  $("[cardname]").each(function() {
    supplied_cards[$(this).attr("cardname")] = true;
  });

  maybeWatchTradeRoute();

  activeDataHandleFirstTurn();
}

function maybeHandleTurnChange(node) {
  var text = node.innerText;
  if (text.indexOf("—") != -1) {
    maybeHandleFirstTurn();

    var maybe_number = text.match(/([0-9]+) —/);
    if (maybe_number) turn_number = maybe_number[1];

    activeDataEndTurn();

    // This must be a turn start.
    if (text.match(/— Your (?:extra )?turn/)) {
      last_player = getPlayer("You");
    } else {
      var arr = text.match(/— (.+)'s .*turn/);
      if (arr && arr.length == 2) {
        last_player = getPlayer(arr[1]);
      } else {
        handleError("Couldn't handle turn change: " + text);
      }
    }

    if (last_player == null) {
      console.log("Failed to get player from: " + node.innerText);
    }

    markCurrentPlayer();

    activeDataStartTurn();

    // The start of the turn is styled to match the player's data area.
    $(node).addClass(last_player.classFor);

    // If we don't know the icon, look it up from this turn start.
    if (last_player.icon == undefined) {
      var imgs = node.getElementsByTagName("img");
      if (imgs.length > 0)
        last_player.setIcon(imgs[0]);
    }

    possessed_turn = text.match(/\(possessed by .+\)/);

    if (debug_mode) {
      var details = " (" + getDecks() + " | " + getScores() + ")";
      node.innerHTML.replace(" —<br>", " " + details + " —<br>");
    }

    return true;
  }
  return false;
}

function markInfoAsOurs(table) {
  table.parent().addClass('internalInfoPage');
  var row = $('<tr/>');
  var col = $('<td/>').attr('colspan', '2');
  table.append(row);
  row.append(col.html('This info window is for internal testing purposes. ' +
      'It should have been dismissed automatically without you seeing it. ' +
      'If you see this, please dismiss it and let us know.'));
}

function maybeRunInfoWindowTests(table) {
  if (!infoIsForTests) return;

  // Make sure the table we're looking at is the info table
  if (table.tagName != 'TABLE') return;
  if (table.innerText.indexOf("Trash:") < 0) return;

  try {
    table = $(table);
    markInfoAsOurs(table);
    infoWindowTests(table);
  } finally {
    infoIsForTests = false;
    $("body > div.black").remove();
  }
}

function infoWindowTests(table) {
  // Our checks will definitely fail in an erroneous state.
  if (announced_error) return;

  if ($('#choices span.stash-pos-marker').length > 0) {
    // This check exists because it is possible to have the info window pop up
    // when the user is being asked where to locate the Stash card in the deck.
    // When that happens, the info window is incorrect (it doesn't show the
    // cards already drawn before the shuffle). This means that we cannot tell
    // how big the deck is, even if we count the number of cards shown in the
    // span choice. This is rare, so we just skip the tests in this case.
    logDebug('infoData',
        "--- Skipping info window tests during stash placement\n");
    return;
  }

  logDebug('infoData', "--- Running info tests ---\n");

  var msgs = [];
  var foundProblem = false;

  function checkValue(actual, expected, text) {
    var valid = (actual == expected);
    var label;
    var op;
    if (valid) {
      label = 'valid';
      op = '==';
    } else {
      label = '==INVALID==';
      op = '!=';
      foundProblem = true;
    }
    var msg = label + ': ' + actual + ' ' + op + ' ' + expected + ' ' +
        player.name + ': ' + text;
    logDebug('infoData', msg);
    msgs.push(msg);
  }

  function countCards(str) {
    if (str == 'nothing') {
      return 0;
    }
    var sep = /(?:,\s*|,?\s*\band\b\s*)+/g;
    var split = str.split(sep);
    logDebug('infoDataDetailed', 'pattern: ' + sep);
    logDebug('infoDataDetailed',
        'split ' + split.length + ': |' + split.join('|') + '|');
    var count = split.length;
    for (var i = 0; i < split.length; i++) {
      var cardSpec = split[i];
      var match = cardSpec.match(/^\d+/);
      if (match) {
        count += parseInt(match[0]) - 1;
      }
    }
    return count;
  }

  function addToCardCount(count) {
    if (isNaN(player.testCardCount)) return;
    player.testCardCount += count;
    if (player.testCardCountStr.length > 0) {
      player.testCardCountStr += '+';
    }
    player.testCardCountStr += count;
  }

  function parseInfoNumber(str) {
    return str == 'nothing' ? 0 : parseInt(str);
  }

  function setCurrentPlayer(p) {
    player = p;
    player.testCardCount = 0;
    player.testCardCountStr = '';
    player.testSeenIslandMat = false;
  }

  var player = tablePlayer;
  setCurrentPlayer(tablePlayer);

  var tests = [
    { pat: /^Trash:\(?(nothing|\d+)/,
      act: function(row, match) {
        var count = parseInfoNumber(match[1]);
        checkValue(count, tablePlayer.deck_size, row.text());
      }
    },
    { pat: /^—— (.*) ——/,
      act: function(row, match) {
        var playerName = rewriteName(match[1]);
        setCurrentPlayer(getPlayer(playerName));
      }
    },
    { pat: /Current score:([0-9]+)/,
      act: function(row, match) {
        // The score isn't reliable if we've had an error.
        if (test_only_my_score && player.name != "You") return;
        var scoreStr = player.get('score');
        var equals = scoreStr.indexOf('=');
        if (equals > 0) {
          scoreStr = scoreStr.substring(equals + 1);
        }
        checkValue(parseInt(match[1]), parseInt(scoreStr), row.text());
      }
    },
    // The rest of the tests rely on active data, so they only run if it's on.
    { pat: /^(Hand|Play area|Previous duration): *([^\d].*)/,
      act: function(row, match) {
        if (!debug['actvData']) return;
        addToCardCount(countCards(match[2]));
        if (match[1] == 'Previous duration') {
          // Each Haven in the duration implies one *or more* cards set aside.
          // These cards are not listed in the info window, even for you. Which
          // means that if there are Havens, we can't really tell how many cards
          // are in the decks. (It can be more than one card if Haven was played
          // with Throne Room or King's Court.)
          if (match[2].match(/\bHaven\b/g)) {
            player.testCardCount = NaN;
            player.testCardCountStr = 'Haven prevents deck size test';
          }
        }
      }
    },
    { pat: /^(.*) (?:mat|aside): *(.*)/,
      act: function(row, match) {
        if (!debug['actvData']) return;
        // Test set for the mat/aside area (includes chapel for thinning):
        // haven, horse traders, library, possession, island, native village, pirate ship, trade route, chapel
        // Island mat (also uses the term "aside" in the text)
        // Native Village mat (also uses the term "aside" in the text)
        // Pirate Ship mat
        // Trade Route mat
        // aside: Haven
        // aside: Horse Traders (reaction)
        // aside: Library (only during the turn)
        // aside: Possession (only during the turn)
        var count = countCards(match[2]);
        if (match[1] == "Island") {
          // cards held by islands are not in the deck count (as we show it)
          checkValue(count, player.asideCount(), row.text());
          player.testSeenIslandMat = true;
        } else if (match[1] == 'Pirate Ship') {
          // We should count and show pirate ship mat tokens
        } else {
          addToCardCount(count);
        }
      }
    },
    { pat: /^(?:Hand|Draw pile):(nothing|\d+)/,
      act: function(row, match) {
        if (!debug['actvData']) return;
        addToCardCount(parseInfoNumber(match[1]));
      }
    },
    { pat: /^(Draw|Discard) pile:/,
      act: function(row, match) {
        if (!debug['actvData']) return;
        if (player == null) {
          logDebug('actvData', "Warning: Player is null!!\n");
          return;
        }
        var isDiscard = (match[1] == "Discard");
        var count = 0;
        var paddingStrs = '';
        $(row).find('span.discards').each(function() {
          var paddingSpec = $(this).css('padding-left');
          if (paddingStrs.length > 0) {
            paddingStrs += '+';
          }
          match = paddingSpec.match(/([0-9]+)px/);
          if (match) {
            paddingStrs += match[1];
            count += parseInt(match[1]) / 6;
          }
        });
        addToCardCount(count);
        player.testCardCountStr += '[' + paddingStrs + 'px]';
        if (isDiscard && !isNaN(player.testCardCount)) {
          if (!player.testSeenIslandMat) {
            // The info window is can be silent about the island mat for other
            // players so we have to expect the deck to include what's there.
            player.testCardCount += player.asideCount()
          }
          checkValue(player.testCardCount, player.deck_size,
              player.testCardCountStr);
        }
      }
    }
  ];

  table.find('tr').each(function() {
    var tr = $(this);
    var text = tr.text().replace(/\s+/g, ' ');
    for (var i = 0; i < tests.length; i++) {
      var test = tests[i];
      var match = test.pat.exec(text);
      if (match) {
        test.act(tr, match);
        break;
      }
    }
  });

  if (foundProblem && debug['infoData']) {
    alert("Found problems with data: see console log");
  }
}

function handleScoping(text_arr, text) {
  var depth = 1;
  for (var t in text_arr) {
    if (text_arr[t] == "...") ++depth;
  }
  var scope = '';
  while (depth <= scopes.length) {
    scope = scopes.pop();
  }
  if (text.indexOf("revealing a Watchtower") != -1 ||
      text.indexOf("You reveal a Watchtower") != -1) {
    scope = 'Watchtower';
  } else {
    var re = new RegExp("(?:You|" + player_re +
        ") (?:play|buy)s? an? ([^.]*)\\.");
    var arr = text.match(re);
    if (arr && arr.length == 3) {
      scope = arr[2];
    }
  }
  scopes.push(scope);
}

function maybeReturnToSupply(text) {
  return unpossessed(function () {
    if (text.indexOf("it to the supply") != -1) {
      last_player.gainCard(last_reveal_card, -1, false);
      return true;
    } else {
      var arr = text.match("([0-9]*) copies to the supply");
      if (arr && arr.length == 2) {
        last_player.gainCard(last_reveal_card, -arr[1], false);
        return true;
      }
    }
    return false;
  });
}

function maybeHandleGainInHand(elems, text) {
  // Normally, "Bob gains a Gold in hand" means that Bob gets a new Gold.
  // But if Alice is currently possessing Bob, and uses a card like Mine to
  // trash a Silver to replace it with a Gold in the hand, we will see a message
  // like "Bob gains a Gold in hand". This doesn't mean that Bob gets a new
  // Gold, it actually means "A Gold is put into Bob's hand". A following
  // message will say who literally gets the new Gold: "... Alice gains the
  // Gold". So during Possession, "gains [...] in hand" doesn't mean "gain"
  // in the same way as everywhere else.
  if (text.match(/gain(ing)? a (.*) in (your )?hand/)) {
    if (!possessed_turn) {
      last_player.gainCard(elems[elems.length - 1], 1);
    }
    return true;
  }
  return false;
}

function maybeHandleMint(elems, text) {
  if (elems.length != 1) return false;
  if (text.match("and gain(ing)? another one.")) {
    last_player.gainCard(elems[0], 1);
    return true;
  }
  return false;
}

function maybeHandleTradingPost(elems, text) {
  if (text.indexOf(", gaining a Silver in hand") == -1) {
    return false;
  }
  if (elems.length != 2 && elems.length != 3) {
    handleError("Error on trading post: " + text);
    return true;
  }
  var elem = 0;
  last_player.gainCard(elems[0], -1);
  if (elems.length == 3) elem++;
  last_player.gainCard(elems[elem++], -1);
  last_player.gainCard(elems[elem], 1);
  return true;
}

function maybeHandleSwindler(elems, text) {
  var player = null;
  if (text.indexOf("replacing your") != -1) {
    player = getPlayer("You");
  }
  var arr = text.match(new RegExp("You replace " + player_re + "'s"));
  if (!arr) arr = text.match(new RegExp("replacing " + player_re + "'s"));
  if (arr && arr.length == 2) {
    player = getPlayer(arr[1]);
  }

  if (player) {
    if (elems.length == 2) {
      // Note: no need to subtract out the swindled card. That was already
      // handled by maybeHandleOffensiveTrash.
      player.gainCard(elems[1], 1);
    } else {
      handleError("Replacement has " + elems.length + " elements: " + text);
    }
    return true;
  }
  return false;
}

//noinspection JSUnusedLocalSymbols
function maybeHandlePirateShip(elems, text_arr, text) {
  // Swallow gaining pirate ship tokens.
  // It looks like gaining a pirate ship otherwise.
  //noinspection RedundantIfStatementJS
  if (text.indexOf("a Pirate Ship token") != -1) {
    getPlayer(text_arr[0]).changeField('pirateShipTokens', 1);
    return true;
  }
  return false;
}

//noinspection JSUnusedLocalSymbols
function maybeHandleToNativeVillage(elems, text_arr, text) {
  var m = text.match(/ (to|on) the Native Village mat\./);
  if (m) {
    if (elems.length == 2) {
      last_player.addToCardGroup('nativeVillage', $(elems[0]));
    } else if (!text.match(/ drawing nothing /)) {
      last_player.changeField('nativeVillage', 1);
    }
    return true;
  }
  return false;
}

//noinspection JSUnusedLocalSymbols
function maybeHandleGainViaReveal(elems, text_arr, text) {
  if (elems.length == 2 &&
      text.match(/reveal(ing|s) an? (.*) and gain(ing|s)? an? (.*)\./)) {
    last_player.gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleFromNativeVillage(text) {
  if (text.match(/ pick(s|ing) up .+ from the Native Village mat/)) {
    last_player.set('nativeVillage', 0);
    return true;
  } else if (text.match(/ puts? the mat contents into (.+) hand\./)) {
    last_player.clearCardGroup('nativeVillage');
    return true;
  }
  return false;
}

function maybeHandleSeaHag(elems, text_arr, text) {
  if (text.indexOf("a Curse on top of") != -1) {
    if (elems < 1 || elems[elems.length - 1].innerHTML != "Curse") {
      handleError("Weird sea hag: " + text);
      return false;
    }
    getPlayer(text_arr[0]).gainCard(elems[elems.length - 1], 1);
    return true;
  }
  return false;
}

// This can be triggered by Saboteur, Swindler, and Pirate Ship.
function maybeHandleOffensiveTrash(elems, text_arr, text) {
  if (elems.length == 1) {
    if (text.indexOf("is trashed.") != -1) {
      last_reveal_player.gainCard(elems[0], -1);
      return true;
    }
    if (text.indexOf("and trash it.") != -1 ||
        text.indexOf("and trashes it.") != -1) {
      getPlayer(text_arr[0]).gainCard(elems[0], -1);
      return true;
    }

    if (text.match(/trashes (?:one of )?your/)) {
      last_reveal_player.gainCard(elems[0], -1);
      return true;
    }

    var arr = text.match(new RegExp("trash(?:es)? (?:one of )?" + player_re +
        "'s"));
    if (arr && arr.length == 2) {
      getPlayer(arr[1]).gainCard(elems[0], -1);
      return true;
    }
    return false;
  }
  return false;
}

function maybeHandleTournament(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/and gains? a .+ on (the|your) deck/)) {
    getPlayer(text_arr[0]).gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleTrader(elems, text_arr, text) {
  if (elems.length == 3 && text.match(/a Trader to gain a Silver/)) {
    getPlayer(text_arr[0]).gainCard(elems[2], -1);
    return true;
  }
  return false;
}

function maybeHandleTunnel(elems, text_arr, text) {
  if (elems.length == 2 && text.match(/reveals? a Tunnel and gain/)) {
    getPlayer(text_arr[0]).gainCard(elems[1], 1);
    return true;
  }
  return false;
}

function maybeHandleNobleBrigand(elems, text_arr, text) {
  if (text.match(/draws? and reveals?.+, trashing a/)) {
    getPlayer(text_arr[0]).gainCard(elems[elems.length - 1], -1);
    return true;
  }
  return false;
}

function maybeHandleVp(text) {
  var re = new RegExp("[+]([0-9]+) ▼");
  var arr = text.match(re);
  if (arr && arr.length == 2) {
    last_player.changeScore(arr[1]);
  }
}

function getCardCount(card, text) {
  var count = 1;
  var re = new RegExp("([0-9]+) " + card);
  var arr = text.match(re);
  if (arr && arr.length == 2) {
    count = arr[1];
  }
  return count;
}

function handleGainOrTrash(player, elems, text, multiplier) {
  for (var elem in elems) {
    if (elems[elem].innerText != undefined) {
      var card = elems[elem].innerText;
      var count = getCardCount(card, text);
      var num = multiplier * count;
      if (possessed_turn && num < 0) {
        // Skip trashing any cards during possession.
      } else {
        player.gainCard(elems[elem], num);
        // If Thief is used to gain the trashed card, take it back out
        if (text.match(/ gain(s|ed)? the trashed /) ||
            topScope() == "Noble Brigand") {
          tablePlayer.gainCard(elems[elem], -num);
        }
      }
    }
  }
}

function maybeHandleGameStart(node) {
  var nodeText = node.innerText;
  if (nodeText == null || nodeText.indexOf("Turn order") != 0) {
    return false;
  }
  initialize(node);
  maybeAddToFullLog(node);
  return true;
}

// Perform a function that should behave the same whether or not the current
// player is posessed.
function unpossessed(action) {
  // Remember the current state of possession.
  var originallyPossessed = possessed_turn;
  try {
    possessed_turn = false;
    return action();
  } finally {
    possessed_turn = originallyPossessed;
  }
}

function startInfoWIndowTests() {
  // Should not run these tests while restoring from log.
  if (!restoring_history) {
    infoIsForTests = true;
    $('button:contains(info)').click();
  }
}

function maybeOfferToPlay(node) {
  var innerText = node.innerText;
  if (innerText && innerText.indexOf("play this game ") == 0) {
    // If you get an offer to play a game, you aren't in the middle of one.
    removeLog();
    return true;
  }
  return false;
}

function handleLogEntry(node) {
  // These are used for messages from the administrator, and should be ignored.
  if (node.innerText.indexOf("»»»") == 0) return;
  if (node.parentNode.id == 'full_log') return;

  logDebug('logShown', node.innerText);

  if (maybeHandleGameStart(node)) return;

  if (!started) return;

  try {
    // Ignore the purple log entries during Possession.
    // When someone is possessed, log entries with "possessed-log" are what
    // describe the "possession". The other (normal) log entries describe the
    // actual game effect. So we ignore the "possessed" entries because they
    // are what is being commanded, not what is actually happening to the cards.
    // (For example, if you possess Alice, then in "possessed-log" entries, it
    // says "You play a Silver", but the actual game effect is as if Alice
    // played the Silver (that is, Alice, as a player, gets $2 more to work
    // with, it's just that you, not Alice, are deciding what to do with
    // that $2).
    if (possessed_turn && $(node).hasClass("possessed-log")) return;

    handlePlayLog(node);
  } finally {
    // make sure we are using the node after any rewrites
    maybeAddToFullLog(node);
    showCurrentInfo();
  }
}

var last_summary = '';

function showCurrentInfo() {
  if (!debug['infoData']) return;
  var summary = '';
  showStatus('all', function(msg) {
    summary += msg + "\n";
  });
  if (summary != last_summary) {
    logDebug('infoData', summary);
    last_summary = summary;
  }
}

function handlePlayLog(node) {
  maybeRewriteName(node);

  if (maybeHandleTurnChange(node)) {
    startInfoWIndowTests();
    return;
  }
  if (maybeHandleResignation(node)) return;

  // Make sure this isn't a duplicate possession entry.
  if (node.className.indexOf("possessed-log") > 0) return;

  var nodeText = node.innerText;
  var text = nodeText.split(" ");

  // Keep track of what sort of scope we're in for things like watchtower.
  handleScoping(text, nodeText);

  // Gaining VP could happen in combination with other stuff.
  maybeHandleVp(nodeText);

  var elems = node.getElementsByTagName("span");

  if (activeDataHandleCounts(elems, nodeText)) return;

  // elems.length may be zero for this, so try before the check for zero elems.
  if (maybeHandleFromNativeVillage(nodeText)) return;

  if (elems.length == 0) {
    if (maybeReturnToSupply(nodeText)) return;
    return;
  }

  // Remove leading stuff from the text.
  var i = 0;
  for (i = 0; i < text.length; i++) {
    if (!text[i].match(/^[. ]*$/)) break;
  }
  if (i == text.length) return;
  text = text.slice(i);

  if (maybeHandleMint(elems, nodeText)) return;
  if (maybeHandleTradingPost(elems, nodeText)) return;
  if (maybeHandleGainInHand(elems, nodeText)) return;
  if (maybeHandleSwindler(elems, nodeText)) return;
  if (maybeHandlePirateShip(elems, text, nodeText)) return;
  if (maybeHandleSeaHag(elems, text, nodeText)) return;
  if (maybeHandleOffensiveTrash(elems, text, nodeText)) return;
  if (maybeHandleTournament(elems, text, nodeText)) return;
  if (maybeHandleIsland(elems, text, nodeText)) return;
  if (maybeHandleCoppersmith(elems, text, nodeText)) return;
  if (maybeHandleToNativeVillage(elems, text, nodeText)) return;
  if (maybeHandleGainViaReveal(elems, text, nodeText)) return;
  if (maybeHandleTrader(elems, text, nodeText)) return;
  if (maybeHandleTunnel(elems, text, nodeText)) return;
  if (maybeHandleNobleBrigand(elems, text, nodeText)) return;

  if (text[0] == "trashing") {
    var trasher = last_player;
    if (topScope() == "Watchtower") {
      trasher = last_gain_player;
    }
    handleGainOrTrash(trasher, elems, nodeText, -1);
    return;
  }
  if (text[1].indexOf("trash") == 0) {
    handleGainOrTrash(getPlayer(text[0]), elems, nodeText, -1);
    return;
  }
  if (text[0] == "gaining") {
    // When possessed, gaining a card (from, say, a University) is like
    // buying one -- it's the possessor, not the possessee, who gains it, which
    // is stated by a later log message.
    if (!possessed_turn) {
      handleGainOrTrash(last_player, elems, nodeText, 1);
    }
    return;
  }
  if (text[1].indexOf("gain") == 0) {
    handleGainOrTrash(getPlayer(text[0]), elems, nodeText, 1);
    return;
  }

  var player = getPlayer(text[0]);
  var action = text[1];

  // Handle revealing cards.
  if (action.indexOf("reveal") == 0) {
    last_reveal_player = player;
    last_reveal_card = elems[elems.length - 1];
  }

  // Expect one element from here on out.
  if (elems.length > 1) return;

  // It's a single card action.
  var card_elem = elems[0];
  var card_name = elems[0].innerText;
  var card = card_map[card_name];

  if (action.indexOf("buy") == 0) {
    var count = getCardCount(card_name, nodeText);
    // In possessed turns, it isn't who buys something, it's who "gains" it
    // (and who gains it is stated in a separate log entry).
    if (!possessed_turn) {
      player.gainCard(card_elem, count);
    }
    activeDataCardBought(count, card);
  } else if (action.indexOf("pass") == 0) {
    unpossessed(function() {
      if (player_count > 2) {
        maybeAnnounceFailure("⚠ Warning: Masquerade with more than 2 " +
            "players causes inaccurate score counting.");
        test_only_my_score = true;
      }
      player.gainCard(card_elem, -1, false);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card_elem, 1);
      }
    });
  } else if (action.indexOf("receive") == 0) {
    unpossessed(function() {
      player.gainCard(card_elem, 1);
      var other_player = findTrailingPlayer(node.innerText);
      if (other_player != null) {
        other_player.gainCard(card_elem, -1, false);
      }
    });
  }
}

function getScores() {
  var scores = "Points: ";
  for (var player in players) {
    scores = scores + " " + player + "=" + players[player].getScore();
  }
  return scores;
}

// Add a row to a table.
function addRow(tab, rowClass, innerHTML) {
  var r = $('<tr/>');
  if (rowClass)
    r.addClass(rowClass);
  $(tab).append(r);
  r.html(innerHTML);
  return r;
}

// Set up the card count cell for a given player+card combination in text mode.
function setupCardCountCellForPlayer(player, cardName) {
  var cellId = player.idFor(cardName);
  if (!document.getElementById(cellId)) {
    return $('<td id="' + cellId + '">' + player.cardCountString(cardName) +
        '</td>').addClass("playerCardCountCol").addClass(player.classFor);
  } else {
    return null;
  }
}

// Any row that spans a number of columns should span the added columns.
// Use the attribute "grown" to avoid adjusting the same thing multiple times.
function growHeaderColumns() {
  var toAdd = player_count + 1; // the extra is for the trash player

  $("#supply > table > tbody > tr > td[colspan]:not([grown])").each(function() {
    var $this = $(this);
    var origSpanStr = $this.attr('colspan');
    var origSpan = parseInt(origSpanStr);
    $this.attr('colspan', (origSpan + toAdd));
    $this.attr('grown', toAdd);
  });
}

function ungrowHeaderColumns() {
  $('#supply td[grown]').each(function() {
    var $this = $(this);
    var grownBy = $this.attr('grown');
    var colspan = $this.attr('colspan');
    $this.attr('colspan', (parseInt(colspan) - parseInt(grownBy)));
    $this.removeAttr('grown');
  });
}

// Set up the card count cells for all players (including the trash player) in
// text mode.
function setupPerPlayerTextCardCounts() {
  // For each row in the supply table, add a column count cell for each player.
  $(".txcardname").each(function() {
    var $this = $(this);
    var cardName = $this.children("[cardname]").first().attr('cardname');
    // Insert new cells after this one.
    var insertAfter = $this.next();
    allPlayers(function(player) {
      var cell = setupCardCountCellForPlayer(player, cardName);
      if (cell != null) {
        insertAfter.after(cell);
        insertAfter = cell;
      }
    });
  });
  growHeaderColumns();
}

// Set up the per-player card counts in image mode for a given column.
function setupPerPlayerImageCardCounts(region) {
  var selector = '.' + region + '-column';

  // make "hr" rows span all columns
  var numPlayers = 1 + player_count + 1;
  $(selector + ' .hr:empty').append('<td colspan="' + numPlayers + '"></td>');

  $(selector + ' .supplycard').each(function() {
    var $this = $(this);
    var cardName = $this.attr('cardname');
    allPlayers(function(player) {
      var cell = setupCardCountCellForPlayer(player, cardName);
      if (cell != null)
        $this.append(cell);
    });
  });
}

// Execute a function for all players, including the trash player.
function allPlayers(func) {
  for (var playerName in players) {
    func(players[playerName]);
  }
  if (tablePlayer) {
    func(tablePlayer);
  }
}

// Return the string used for DOM ID's for a given (card) name -- we
// canonicalize it to be always lower case, stripping out non-letters.
function toIdString(name) {
  return name.replace(/[^a-zA-Z]/gi, "").toLowerCase();
}

function updateScores() {
  if (last_player == null) return;
  maybeSetupCardCounts();
  rewriteTree(function() {
    allPlayers(function(player) {
      player.updateScore();
    });
  });
}

// Set up the player area in which per-player info will be displayed.
function setupPlayerArea() {
  if ($('#playerDataTable').length > 0) {
    return;
  }

  var ptab = $('<table/>');
  if (!text_mode) {
    ptab.attr('align', 'right');
  }
  ptab.attr('id', 'playerDataTable');

  if (text_mode) {
    var outerTable = $('<table/>');
    outerTable.attr('id', 'playerDataArranger');
    var row = addRow(outerTable, null,
        '<td id="playerDataContainer" valign="bottom"></td>' +
            '<td id="logContainer" valign="bottom"></td>');
    var kids = row.children();
    kids.first().append(ptab);
    kids.last().append($('#log'), $('#full_log'), $('#choices'));
    $('#game > :first-child').before(outerTable);
  } else {
    var player_spot = $('#supply');
    rewriteTree(function () {
      var outerCell = $('<td valign="bottom"/>');
      $(player_spot).replaceWith(outerCell);
      outerCell.append(ptab);
      outerCell.append(player_spot);
    });
  }
  // Start out hidden until the first turn, so if veto mode is going on, we
  // aren't showing the in-play data area.
  ptab.hide();
}

// As needed, set per-card count columns.
function maybeSetupCardCounts() {
  rewriteTree(function () {
    if (text_mode) {
      setupPerPlayerTextCardCounts();
    } else {
      setupPerPlayerImageCardCounts('kingdom');
      setupPerPlayerImageCardCounts('basic');
    }
    updateCardCountVisibility();
  });
}

// Set up player data area and the per-card count columns.
function setupPerPlayerInfoArea() {
  if (disabled) return;

  //!! Show how far through the deck each player is
  //!! Include sub-score areas for each 'extra' type (Duke, Fairgrounds, ...)
  //!! Show how much each 'extra' type would be worth (Duke, Fairgrounds, ...)
  rewriteTree(function () {
    setupPlayerArea();
    markCurrentPlayer();
  });
}

function markCurrentPlayer() {
  if (disabled) return;
  if (last_player == null) return;

  // Even if we're not tracking active player data, we mark the current player
  $('.activeMark').removeClass('activeMark');
  $('#' + last_player.idFor('mark')).addClass('activeMark');

  activeDataPlace();
}

// Remove the card counts columns
function removeCardCounts() {
  $(".playerCardCountCol").remove();
}

// Remove the player area, such as at the end of the game or if disabled.
function removePlayerArea() {
  var ptab = document.getElementById("playerData");
  if (!ptab) {
    // If there is no overall 'playerData' item, then it's just the table
    ptab = document.getElementById('playerDataTable');
  }
  if (ptab != null && ptab.parentNode != null) {
    activeDataStop();
    ptab.parentNode.removeChild(ptab);
  }
  removeCardCounts();
  ungrowHeaderColumns();
}

function getDecks() {
  var decks = "Cards: ";
  for (var player in players) {
    decks = decks + " " + player + "=" + players[player].getDeckString();
  }
  return decks;
}

function updateDeck(player) {
  player = player || last_player;
  if (player == null) return;
  rewriteTree(function() {
    player.updateDeck();
  });
}

function topScope(skipping) {
  skipping = skipping || 0;
  for (var i = scopes.length - 1; i >= 0; i--) {
    var scope = scopes[i];
    if (scope && scope.length > 0) {
      if (--skipping < 0) return scopes[i];
    }
  }
  return undefined;
}

function findScope(name) {
  var top = scopes.length - 1;
  for (var i = top; i >= 0; i--) {
    if (scopes[i] == name) {
      return top - i;
    }
  }
  return -1;
}

function initialize(doc) {
  started = true;
  introduced = false;
  i_introduced = false;
  disabled = false;
  had_error = false;
  possessed_turn = false;
  announced_error = false;
  test_only_my_score = false;
  maxTradeRoute = undefined;
  seen_first_turn = false;
  turn_number = 0;

  last_gain_player = null;
  scopes = [];
  activeDataInitialize();
  players = new Object();
  player_rewrites = new Object();
  player_re = "";
  player_count = 0;

  discoverGUIMode();
  setupPerPlayerInfoArea();

  if (localStorage['disabled']) {
    disabled = true;
  }

  // Figure out which turn we are. We'll use that to figure out how long to wait
  // before announcing the extension.
  var self_index = -1;

  //!! We need to also rewrite players named "you", "You", "Your", etc.
  // Hack: collect player names with spaces and apostrophes in them. We'll
  // rewrite them and then all the text parsing works as normal.
  var arr;
  if (doc.innerText == "Turn order is you.") {
    arr = [undefined, "you"];
  } else {
    var p = "(?:([^,]+), )";    // an optional player
    var pl = "(?:([^,]+),? )";  // the last player (might not have a comma)
    var re = new RegExp("Turn order is " + p + "?" + p + "?" + p + "?" + pl +
        "and then (.+).");
    arr = doc.innerText.match(re);
  }
  if (arr == null) {
    handleError("Couldn't parse: " + doc.innerText);
  }
  var other_player_names = [];
  player_count = 0;
  for (var i = 1; i < arr.length; ++i) {
    if (arr[i] == undefined) continue;

    player_count++;
    if (arr[i] == "you") {
      self_index = player_count;
      arr[i] = "You";
    }
    var rewritten = rewriteName(arr[i]);
    if (rewritten != arr[i]) {
      player_rewrites[htmlEncode(arr[i])] = htmlEncode(rewritten);
      arr[i] = rewritten;
    }
    // Initialize the player.
    players[arr[i]] = new Player(arr[i], player_count);

    if (arr[i] != "You") {
      other_player_names.push(RegExp.quote(arr[i]));
    }

  }
  player_re = '(' + other_player_names.join('|') + ')';

  // Create a new "player" representing the playing table, mostly the trash.
  tablePlayer = new Player('', i);

  if (!disabled) {
    updateScores();
    updateDeck();
  }

  // Assume it's already introduced if it's rewriting the tree for a reload.
  // Otherwise setup to maybe introduce the extension.
  if (!restoring_history) {
    var wait_time = 200 * Math.floor(Math.random() * 10 + 5);
    if (self_index != -1) {
      wait_time = 300 * self_index;
    }
    console.log("Waiting " + wait_time + " to introduce " + "(index is: " +
        self_index + ").");
    setTimeout("maybeIntroducePlugin()", wait_time);
  }
}

function maybeRewriteName(doc) {
  if (doc.innerHTML != undefined && doc.innerHTML != null) {
    for (var player in player_rewrites) {
      doc.innerHTML = doc.innerHTML.replace(player, player_rewrites[player]);
    }
  }
}

function originalName(maybeRewrittenName) {
  for (var name in player_rewrites) {
    if (player_rewrites[name] == maybeRewrittenName) {
      return name;
    }
  }
  return maybeRewrittenName;
}

function writeHelp() {
  writeText("Type !status to see player score and deck info.");
  writeText("Type !counts to see card counts.");
  activeDataWriteTextPrompt();
  if (canDisable()) {
    writeText("Type !disable by turn 5 to disable the point counter.");
  }
}

function maybeIntroducePlugin() {
  if (!introduced && !disabled) {
    writeText("★ Game scored by Dominion Point Counter ★");
    writeText("http://goo.gl/iDihS");
    writeHelp();
  }
}

function maybeShowStatus(request, request_time) {
  if (!started) return;

  //noinspection ConstantIfStatementJS
  if (true) {
    // This code lets us loop through a set of possible prefix chars to choose
    // one we like.
    chat_prefix = chat_prefix_symbols[chat_prefix_num++];
    if (chat_prefix_num >= chat_prefix_symbols.length) {
      chat_prefix_num = 0;
    }
  }

  if (last_status_print < request_time) {
    last_status_print = new Date().getTime();
    showStatus(request, writeText);
  }
}

function showStatus(request, show) {
  var my_name = localStorage["name"];
  if (my_name == undefined || my_name == null) my_name = "Me";

  show = show || writeText;
  function writeStatus(msg) {
    show(chat_prefix + " " + msg.replace(/\bYou([:=])/g, my_name + "$1"));
  }

  switch (request) {
  case "status":
    writeStatus(getDecks() + " | " + getScores());
    break;
  case "counts":
    allPlayers(function(player) {
      writeStatus(player.countString());
    });
    break;
  case "info":
    allPlayers(function(player) {
      writeStatus(player.infoString());
    });
    break;
  case "active":
    writeStatus(activeDataString());
    break;
  case 'all':
    writeStatus(activeDataString());
    allPlayers(function(player) {
      writeStatus(player.countString());
      writeStatus(player.infoString());
    });
  }
}

function storeLog() {
  if (!debug_mode && !restoring_history) {
    localStorage["log"] = $('#full_log').html();
  }
}

function removeLog() {
  localStorage.removeItem("log");
}

function hideExtension() {
  stopCounting();
  removePlayerData();
  $('#optionPanelHolder').hide();
  $('div[reinserted="true"]').css('display', 'none');
}

function canDisable() {
  return optionSet('allow_disable') && turn_number <= 5;
}

function handleChatText(speaker, text) {
  if (!text) return;
  if (disabled) return;

  var match = text.match("!(status|counts|" + activeDataCommands() + "all)");
  if (match) {
    var time = new Date().getTime();
    var command = "maybeShowStatus('" + match[1] + "', " + time + ")";
    var wait_time = 200 * Math.floor(Math.random() * 10 + 1);
    // If we introduced the extension, we get first dibs on answering.
    if (i_introduced) wait_time = 100;
    setTimeout(command, wait_time);
  } else if (text == " !disable" && canDisable()) {
    localStorage['disabled'] = "t";
    disabled = true;
    hideExtension();
    writeText("☠ Point counter disabled.");
  } else if (text.indexOf(' !') == 0) {
    if (text != '!help') {
      writeText("⚠ Unknown command:" + text);
    }
    writeHelp();
  }

  if (text.indexOf(" " + chat_prefix + " ") == 0) {
    last_status_print = new Date().getTime();
  }
  if (!introduced && text.indexOf(" ★ ") == 0) {
    introduced = true;
    if (speaker == localStorage["name"]) {
      i_introduced = true;
    }
  }
}

function addSetting(setting, output) {
  if (localStorage[setting] != undefined) {
    output[setting] = localStorage[setting];
  }
}

function settingsString() {
  var settings = new Object();
  addSetting("debug", settings);
  addSetting("always_display", settings);
  addSetting("allow_disable", settings);
  addSetting("name", settings);
  addSetting("status_announce", settings);
  addSetting("status_msg", settings);
  return JSON.stringify(settings);
}

function putBackRealLog() {
  // All children -- other things are there to be correctly located with log.
  $('#header').after($('#logContainer').children());
  $('#log').show();
  $('#full_log').remove();
  $('#playerDataArranger').remove();
}

function removePlayerData() {
  removePlayerArea();
  forgetGUIMode();
  putBackRealLog();
  // Return true because this is used as an event handler.
  return true;
}

function stopCounting() {
  started = false;

  if (deck_spot) deck_spot.innerHTML = "exit";
  if (points_spot) points_spot.innerHTML = "faq";

  removeLog();
  activeDataStop();
  $('#optionPanelHolder').show();
  text_mode = undefined;
  players = undefined;
}

function handleGameEnd(doc) {
  for (var node in doc.childNodes) {
    var childNode = doc.childNodes[node];
    if (childNode.innerText == "game log") {
      // Reset exit / faq at end of game.
      stopCounting();
      $(doc).children('a:contains(return)').each(function() {
        $(this).click(removePlayerData);
      });
      removeLog();
      // Collect information about the game.
      var href = childNode.href;
      var game_id_str = href.substring(href.lastIndexOf("/") + 1);
      var name = localStorage["name"];
      if (name == undefined || name == null) name = "Unknown";

      // Double check the scores so we can log if there was a bug.
      var has_correct_score = true;
      var win_log = $('div.logline.em').prev()[0];
      if (!announced_error && win_log) {
        var summary = win_log.innerText;
        for (player in players) {
          var player_name = players[player].name;
          if (player_name == "You") {
            player_name = rewriteName(name);
          }
          var re = new RegExp(RegExp.quote(player_name) +
              " has (-?[0-9]+) points");
          var arr = summary.match(re);
          if (arr && arr.length == 2) {
            var score = ("" + players[player].getScore()).replace(/^.*=/, "");
            if (score.indexOf("+") != -1) {
              score = ("" + players[player].getScore()).replace(/^([0-9]+)\+.*/,
                  "$1");
            }
            if (has_correct_score && arr[1] != score) {
              has_correct_score = false;
              break;
            }
          }
        }
      }

      var printed_state_strings = stateStrings();

      // Post the game information to app-engine for later use for tests, etc.
      //noinspection JSUnusedGlobalSymbols
      chrome.extension.sendRequest({
        type: "log",
        game_id: game_id_str,
        reporter: name,
        correct_score: has_correct_score,
        state_strings: printed_state_strings,
        log: document.body.innerHTML,
        version: extension_version,
        settings: settingsString() });
    } else if (childNode.innerText == "return") {
      childNode.addEventListener("DOMActivate", function() {
        removePlayerData();
      }, true);
    }
  }
}

// If this connotes the start of the game, start it.
function maybeStartOfGame(node) {
  var nodeText = node.innerText.trim();
  if (nodeText.length == 0) {
    return;
  }

  if (!localStorage["log"] && nodeText.indexOf("Your turn 1 —") != -1) {
    // We don't have a any players but it's your turn 1. This must be a
    // solitaire game. Create a fake (and invisible) setup line. We'll get
    // called back again with it by the simple act of adding it (which is why
    // this code is *not* wrapped in rewriteTree()).
    console.log("Single player game.");
    node = $('<div class="logline" style="display:none;">' +
        'Turn order is you.</div>)').insertBefore(node)[0];
    return;
  }

  // Either this is a turn-order log, the start of a new game, or there is a
  // log to restore from, or it isn't the start of any game.
  var isTurnOrder = nodeText.indexOf("Turn order") == 0;
  if (!isTurnOrder && !localStorage["log"]) return;

  createFullLog();

  if (isTurnOrder) {
    // The game is starting, so put in the initial blank entries and clear
    // out any local storage.
    console.log("--- starting game ---");
    removeLog();
    localStorage.removeItem("disabled");
    createFullLog();
  } else {
    try {
      restoring_history = true;
      console.log("--- replaying history ---");
      disabled = localStorage['disabled'];
      if (!restoreHistory(node)) return;
    } finally {
      restoring_history = false;
    }
  }

  started = true;
}

// Returns true if the log node should be handled as part of the game.
function logEntryForGame(node) {
  if (inLobby()) {
    removeLog();
    return false;
  }

  if (!started) {
    maybeStartOfGame(node);
  }
  return started;
}

// Restore the game history from a stored log.
function restoreHistory(node) {
  // The first log line is not the first line of the game, so restore the
  // log from history. Of course, there must be a log history to restore.
  var logHistory = localStorage['log'];
  if (logHistory == undefined || logHistory.length == 0) {
    return false;
  }

  createFullLog();
  restoring_history = true;

  // First build a DOM tree of the old log messages in a copy of the log.
  var log_entries = $('<pre id="temp"></pre>').html(logHistory).children();
  var full_log = $('#full_log');
  log_entries.each(function() {
    var entry = $(this);
    if (entry.html() == node.innerHTML) return false;
    handleLogEntry(entry[0]);
    return true;
  });
  return true;
}

function inLobby() {
  // In the lobby there is no real supply region -- it's empty.
  var playerTable = $('#player_table');
  return (playerTable.length > 0);
}

// Drop any state related to knowing text vs. image mode.
function forgetGUIMode() {
  document.firstChild.id = "";
  $("#body").removeClass("textMode").removeClass("imageMode")
      .removeClass("playing");
}

// Discover whether we are in text mode or image mode. The primary bit of state
// that this sets is for the benefit of CSS: If we are in text mode, body tag
// has the "textMode" class, otherwise it has the "imageMode" class. In both
// cases it has the "playing" class, which allows CSS to tell the difference
// between being in the lobby vs. playing an actual game.
function discoverGUIMode() {
  if (inLobby()) return;

  $('#chat ~ a[href^="/mode/"]').each(function() {
    // The link is to the "text" mode when it's in image mode and vice versa.
    text_mode = $(this).text().indexOf("text") < 0;
  });

  // Setting the class enables css selectors that distinguish between the modes.
  $("#body").addClass("playing").addClass(text_mode ? "textMode" : "imageMode");
}

// Perform a function that rewrites the tree, suppressing the processing of all
// change-related DOM events.
function rewriteTree(func) {
  try {
    rewritingTree++;
    func();
  } finally {
    rewritingTree--;
  }
}

function maybeWatchTradeRoute() {
  if (!tablePlayer) return;

  var stars = $('#supply').find('span.trade-route-star');
  rewriteTree(function () {
    if (stars.length > 0 && !maxTradeRoute) {
      maxTradeRoute = stars.length;
      tablePlayer.change('tradeRoute',
          {suffix: '/' + maxTradeRoute, visible: true});
    }
    if (maxTradeRoute) {
      tablePlayer.set('tradeRoute', maxTradeRoute - stars.length);
    }
  });
}

function updateCardCountVisibility() {
  var countCols = $('.playerCardCountCol');
  if (optionButtons['show_card_counts'].attr('checked')) {
    growHeaderColumns();
    countCols.show();
  } else {
    ungrowHeaderColumns();
    countCols.hide();
  }
}

function addOptionHandler(name, updateVisibility) {
  var button = optionButtons[name];
  button.change(updateVisibility);
  button.change();
}

function addOptionControls(game) {
  var holder = $('<tr id="optionPanelHolder"/>');
  var controls = optionBuildControls('td', false);
  controls.attr('colspan', 2);
  holder.append(controls);
  game.after(holder);
  addOptionHandler('show_card_counts', updateCardCountVisibility);
  addOptionHandler('show_active_data', activeDataUpdateVisibility);
}

function handle(doc) {
  // Ignore DOM events when we are rewriting the tree; see rewriteTree().
  if (rewritingTree > 0) return;

  // When the lobby screen is built, make sure point tracker settings are used.
  if (doc.className && doc.className == "constr") {
    $('#tracker').attr('checked', true).attr('disabled', true);
    $('#autotracker').val('yes').attr('disabled', true);
  }

  var game = $('#game');
  if (game.length > 0) {
    rewriteTree(function () {
      var optPanelHolder = $('#optionPanelHolder');
      if (optPanelHolder.length == 0) {
        addOptionControls(game);
      } else if (game.next()[0].id != optPanelHolder[0].id) {
        // If something has been added so it isn't where it should be, move it.
        game.after(optPanelHolder);
      }
    });
  }

  // We process log entries to the hidden log, copying them to the full log.
  // We don't then process those copies.
  if (doc.parentNode.id == 'full_log') return;

  try {
    if (!started && maybeOfferToPlay(doc)) return;

    // Detect the "Say" button so we can find some children
    if (doc.constructor == HTMLDivElement &&
        doc.innerText.indexOf("Say") == 0) {
      // Pull out the links for future reference.
      var links = doc.getElementsByTagName("a");
      deck_spot = links[1];
      points_spot = links[2];
    }

    activeDataStartHandle(doc);

    if (doc.parentNode.id == 'log') {
      activeDataSetupTests();
      if (logEntryForGame(doc)) {
        handleLogEntry(doc);
        if (started) {
          activeDataMaybeRunTests();
          storeLog();
        }
      }
    }

    // The child nodes of "supply" tell us whether certain cards are in play.
    if (doc.parentNode.id == "supply") {
      show_action_count = false;
      show_unique_count = false;
      show_duchy_count = false;
      show_victory_count = false;
      var elems = doc.getElementsByTagName("span");
      for (var elem in elems) {
        if (elems[elem].innerText == "Vineyard") show_action_count = true;
        if (elems[elem].innerText == "Fairgrounds") show_unique_count = true;
        if (elems[elem].innerText == "Duke") show_duchy_count = true;
        if (elems[elem].innerText == "Silk Road") show_victory_count = true;
      }
      if (tablePlayer) {
        maybeWatchTradeRoute();
      }
    }

    // If the game hasn't started, everything after this is irrelevant.
    if (!started) {
      // This is sometimes left around
      if (document.getElementById("playerDataTable") && inLobby()) {
        removePlayerData();
        $("#copied_temp_say").remove();
      }
      return;
    }

    // If we're adding choices, it may be the choices at the end of the game
    if (doc.constructor == HTMLDivElement && doc.parentNode.id == "choices") {
      handleGameEnd(doc);
      if (!started) return;
    }

    // We follow the chat lines to see if it says something we should react to.
    if (doc.parentNode.id == "chat" && doc.childNodes.length > 2) {
      handleChatText(doc.childNodes[1].innerText.slice(0, -1),
          doc.childNodes[2].nodeValue);
    }

    // Something was added, this is a good time to update the display.
    if (!disabled) {
      updateScores();
      updateDeck();
    }

    maybeRunInfoWindowTests(doc);
  } catch (err) {
    console.log(err);
    console.log(doc);
    var error = '';
    if (doc.innerText != undefined) {
      error += "On '" + doc.innerText + "': ";
    }
    handleError("Javascript exception: " + err.stack);
  }
}

//
// Chat status handling.
//

function buildStatusMessage() {
  var status_message = "/me Auto▼Count";
  if (localStorage["status_msg"] != undefined &&
      localStorage["status_msg"] != "") {
    status_message = status_message + " - " + localStorage["status_msg"];
  }
  return status_message;
}

function enterLobby() {
  if (optionSet('status_announce') && $('#lobby').length != 0 &&
      $('#lobby').css('display') != "none") {
    // Set the original status message.
    writeText(buildStatusMessage());

    // Handle updating status message as needed.
    $('#entry').css('display', 'none');
    $('#entry')
        .after('<input id="fake_entry" class="entry" style="width: 350px;">');
    $('#fake_entry').keyup(function(event) {
      var value = $('#fake_entry').val();
      var re = new RegExp("^/me(?: (.*))?$");
      var arr = value.match(re);
      if (arr && arr.length == 2) {
        // This is a status message update.
        if (arr[1] != undefined) {
          localStorage["status_msg"] = arr[1];
        } else {
          localStorage.removeItem("status_msg");
        }
        value = buildStatusMessage();
      }
      $('#entry').val(value);

      if (event.which == 13) {
        getSayButton().click();
        $('#fake_entry').val("");
      }
    });

    getSayButton().addEventListener('click', function() {
      $('#fake_entry').val("");
    });
  }

  my_icon = $('#log img').first()[0];
}

setTimeout("enterLobby()", 600);

function maybeUpdateTempSay(ev) {
  // Show the temp say dialogues if needed.
  if (ev.relatedNode && ev.relatedNode.id == 'temp_say') {
    var node = $(ev.relatedNode).clone();
    node.attr('id', 'copied_temp_say');
    node.css('color', '#36f');
    node.css('font-style', 'italic');
    node.css('margin-left', '50px');
    $('#copied_temp_say').remove();
    $('#full_log').append(node);
    return;
  }

  // Copy the new html text. If it gets blanked out we don't get an event.
  var temp_say = $('#temp_say');
  if (temp_say.length > 0) {
    $('#copied_temp_say').html(temp_say.html());
  }
}

document.body.addEventListener('DOMNodeInserted', function(ev) {
  maybeUpdateTempSay(ev);
  handle(ev.target);
});

chrome.extension.sendRequest({ type: "version" }, function(response) {
  extension_version = response;
});

function logDebug(area, msg) {
  if (debug[area]) {
    msg = msg.replace(/^/mg, area + ':');
    console.log(msg);
  }
}